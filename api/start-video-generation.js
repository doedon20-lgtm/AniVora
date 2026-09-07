import { fal } from "@fal-ai/client";

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://rurwrecfmbsobqsqiepo.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_slKGnhr4gZJchooJEWE0tQ_2Wdz4t3O";

const MODEL = "fal-ai/vidu/q3/text-to-video";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  try {
    // -----------------------------
    // FAL KEY
    // -----------------------------
    if (!process.env.FAL_KEY) {
      return res.status(500).json({
        success: false,
        error: "FAL_KEY is missing from Vercel."
      });
    }

    fal.config({
      credentials: process.env.FAL_KEY
    });

    // -----------------------------
    // USER AUTH
    // -----------------------------
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

    // -----------------------------
    // REQUEST
    // -----------------------------
    const { jobId } = req.body || {};

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: "jobId is required."
      });
    }

    // -----------------------------
    // GET VIDEO JOB
    // -----------------------------
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

    // -----------------------------
    // GET SCENES
    // -----------------------------
    const scenes = Array.isArray(job.scenes)
      ? job.scenes
      : [];

    if (!scenes.length) {
      return res.status(400).json({
        success: false,
        error: "Your video job has no scenes."
      });
    }

    // -----------------------------
    // SETTINGS
    // -----------------------------
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

    // -----------------------------
    // TEST SAFETY
    // Only submit ONE scene initially.
    // -----------------------------
    const scene = scenes
      .slice()
      .sort(
        (a, b) =>
          Number(a.order || 0) -
          Number(b.order || 0)
      )[0];

    const duration = Math.max(
      1,
      Math.min(
        16,
        Math.round(Number(scene.duration || 5))
      )
    );

    const description =
      String(
        scene.description ||
          scene.prompt ||
          "An anime cinematic scene."
      ).trim();

    const prompt =
      `Anime cinematic animation. ${description}. ` +
      `Detailed characters, expressive animation, ` +
      `beautiful environment, cinematic camera movement, ` +
      `high quality anime visual style.`;

    // -----------------------------
    // SUBMIT REAL FAL JOB
    // -----------------------------
    const submitted = await fal.queue.submit(
      MODEL,
      {
        input: {
          prompt: prompt.slice(0, 2000),
          duration,
          aspect_ratio: aspectRatio,
          resolution,
          audio: false
        }
      }
    );

    const requestId = submitted.request_id;

    if (!requestId) {
      throw new Error(
        "fal.ai did not return a request ID."
      );
    }

    // -----------------------------
    // SAVE FAL REQUEST ID
    // -----------------------------
    const newSettings = {
      ...settings,

      provider: "fal",

      model: MODEL,

      falRequestId: requestId,

      falSceneOrder: scene.order || 1,

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
          settings: newSettings,
          updated_at: new Date().toISOString()
        })
      }
    );

    if (!updateResponse.ok) {
      const details = await updateResponse.text();

      return res.status(500).json({
        success: false,
        error: "Could not save fal.ai request.",
        details
      });
    }

    return res.status(202).json({
      success: true,

      message:
        "Real AI video generation has started.",

      jobId: job.id,

      status: "generating",

      progress: 75,

      provider: "fal",

      model: MODEL,

      requestId
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
        "Failed to start AI video generation."
    });
  }
  }
