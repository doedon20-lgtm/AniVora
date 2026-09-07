// AniVora → fal.ai real video generation

import { fal } from "@fal-ai/client";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://rurwrecfmbsobqsqiepo.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_slKGnhr4gZJchooJEWE0tQ_2Wdz4t3O";

const FAL_MODEL = "fal-ai/vidu/q3/text-to-video";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  try {
    // ----------------------------------
    // Check FAL key
    // ----------------------------------

    if (!process.env.FAL_KEY) {
      return res.status(500).json({
        success: false,
        error: "FAL_KEY is not configured."
      });
    }

    // Configure fal server-side.
    fal.config({
      credentials: process.env.FAL_KEY
    });

    // ----------------------------------
    // Check user authorization
    // ----------------------------------

    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Missing authorization token."
      });
    }

    const accessToken = authHeader
      .replace("Bearer ", "")
      .trim();

    // ----------------------------------
    // Verify Supabase user
    // ----------------------------------

    const userResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired session."
      });
    }

    const user = await userResponse.json();

    if (!user?.id) {
      return res.status(401).json({
        success: false,
        error: "Unable to identify user."
      });
    }

    // ----------------------------------
    // Get job ID
    // ----------------------------------

    const { jobId } = req.body || {};

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: "jobId is required."
      });
    }

    // ----------------------------------
    // Get AniVora video job
    // ----------------------------------

    const jobResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/video_jobs` +
      `?id=eq.${encodeURIComponent(jobId)}` +
      `&user_id=eq.${encodeURIComponent(user.id)}` +
      `&select=*`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!jobResponse.ok) {
      return res.status(500).json({
        success: false,
        error: "Unable to retrieve video job."
      });
    }

    const jobs = await jobResponse.json();

    if (!jobs.length) {
      return res.status(404).json({
        success: false,
        error: "Video job not found."
      });
    }

    const job = jobs[0];

    // ----------------------------------
    // Read scenes
    // ----------------------------------

    const scenes = Array.isArray(job.scenes)
      ? job.scenes
      : [];

    if (!scenes.length) {
      return res.status(400).json({
        success: false,
        error: "This video job has no scenes."
      });
    }

    // ----------------------------------
    // Read settings
    // ----------------------------------

    const settings =
      job.settings &&
      typeof job.settings === "object"
        ? job.settings
        : {};

    const aspectRatio =
      ["16:9", "9:16", "1:1"].includes(
        settings.aspectRatio
      )
        ? settings.aspectRatio
        : "16:9";

    const resolution =
      ["360p", "540p", "720p", "1080p"].includes(
        settings.resolution
      )
        ? settings.resolution
        : "720p";

    // Q3 supports 1–16 seconds.
    function safeDuration(value) {
      const duration = Number(value || 5);

      return Math.max(
        1,
        Math.min(16, Math.round(duration))
      );
    }

    // ----------------------------------
    // Limit initial batch
    //
    // We submit up to 3 scenes at once.
    // This prevents accidentally creating
    // a huge bill from one test.
    // ----------------------------------

    const selectedScenes = scenes
      .slice()
      .sort(
        (a, b) =>
          Number(a.order || 0) -
          Number(b.order || 0)
      )
      .slice(0, 3);

    const providerRequests = [];

    // ----------------------------------
    // Submit scenes to fal.ai
    // ----------------------------------

    for (let i = 0; i < selectedScenes.length; i++) {
      const scene = selectedScenes[i];

      const description =
        String(
          scene.description ||
          scene.prompt ||
          `Anime scene ${i + 1}`
        ).trim();

      const prompt =
        `Anime cinematic scene. ` +
        `${description}. ` +
        `High quality animation, expressive characters, ` +
        `dynamic camera movement, detailed background, ` +
        `consistent anime visual style.`;

      const result = await fal.queue.submit(
        FAL_MODEL,
        {
          input: {
            prompt,
            duration: safeDuration(scene.duration),
            aspect_ratio: aspectRatio,
            resolution,
            audio: false
          }
        }
      );

      providerRequests.push({
        sceneIndex: i,
        sceneOrder: scene.order || i + 1,
        requestId: result.request_id
      });
    }

    // ----------------------------------
    // Save provider information
    // ----------------------------------

    const updatedSettings = {
      ...settings,

      provider: "fal",
      model: FAL_MODEL,

      providerRequests,

      generationStartedAt:
        new Date().toISOString()
    };

    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/video_jobs` +
      `?id=eq.${encodeURIComponent(job.id)}` +
      `&user_id=eq.${encodeURIComponent(user.id)}`,
      {
        method: "PATCH",

        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },

        body: JSON.stringify({
          status: "generating",
          progress: 75,
          settings: updatedSettings,
          updated_at: new Date().toISOString()
        })
      }
    );

    if (!updateResponse.ok) {
      const details = await updateResponse.text();

      return res.status(500).json({
        success: false,
        error: "Video jobs could not be updated.",
        details
      });
    }

    // ----------------------------------
    // Success
    // ----------------------------------

    return res.status(202).json({
      success: true,

      message:
        "AniVora video generation has started.",

      jobId: job.id,

      status: "generating",

      progress: 75,

      provider: "fal",

      model: FAL_MODEL,

      scenesSubmitted:
        providerRequests.length,

      providerRequests
    });

  } catch (error) {
    console.error(
      "START VIDEO GENERATION ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        "Unable to start video generation."
    });
  }
      }
