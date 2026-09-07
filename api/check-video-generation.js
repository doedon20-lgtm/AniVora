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
    // ----------------------------------
    // FAL KEY
    // ----------------------------------

    if (!process.env.FAL_KEY) {
      return res.status(500).json({
        success: false,
        error: "FAL_KEY is missing from Vercel."
      });
    }

    fal.config({
      credentials: process.env.FAL_KEY
    });

    // ----------------------------------
    // AUTHORIZATION
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
    // VERIFY SUPABASE USER
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
    // REQUEST
    // ----------------------------------

    const { jobId } = req.body || {};

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: "jobId is required."
      });
    }

    // ----------------------------------
    // GET ANIVORA JOB
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
    // CHECK IF ALREADY COMPLETED
    // ----------------------------------

    if (
      job.status === "completed" &&
      job.video_url
    ) {
      return res.status(200).json({
        success: true,
        status: "completed",
        progress: 100,
        videoUrl: job.video_url
      });
    }

    // ----------------------------------
    // GET FAL REQUEST ID
    // ----------------------------------

    const settings =
      job.settings &&
      typeof job.settings === "object"
        ? job.settings
        : {};

    const requestId =
      settings.falRequestId;

    if (!requestId) {
      return res.status(400).json({
        success: false,
        error:
          "No fal.ai request ID is attached to this job."
      });
    }

    // ----------------------------------
    // CHECK FAL QUEUE STATUS
    // ----------------------------------

    const status = await fal.queue.status(
      MODEL,
      {
        requestId,
        logs: false
      }
    );

    // ----------------------------------
    // STILL WAITING
    // ----------------------------------

    if (
      status.status === "IN_QUEUE" ||
      status.status === "IN_PROGRESS"
    ) {
      let progress = Number(job.progress || 75);

      if (status.status === "IN_QUEUE") {
        progress = Math.max(progress, 75);
      } else {
        progress = Math.max(progress, 80);
      }

      progress = Math.min(progress, 95);

      await updateJob({
        status: "generating",
        progress
      });

      return res.status(200).json({
        success: true,
        status: "generating",
        falStatus: status.status,
        progress
      });
    }

    // ----------------------------------
    // FAILED
    // ----------------------------------

    if (status.status === "FAILED") {
      const errorMessage =
        "fal.ai video generation failed.";

      await updateJob({
        status: "failed",
        progress: 0,
        error_message: errorMessage
      });

      return res.status(200).json({
        success: false,
        status: "failed",
        error: errorMessage
      });
    }

    // ----------------------------------
    // COMPLETED
    // ----------------------------------

    if (status.status === "COMPLETED") {
      const result = await fal.queue.result(
        MODEL,
        {
          requestId
        }
      );

      const videoUrl =
        result?.data?.video?.url ||
        result?.video?.url ||
        null;

      if (!videoUrl) {
        await updateJob({
          status: "failed",
          progress: 0,
          error_message:
            "fal.ai completed the job but did not return a video URL."
        });

        return res.status(500).json({
          success: false,
          status: "failed",
          error:
            "No video URL was returned by fal.ai."
        });
      }

      await updateJob({
        status: "completed",
        progress: 100,
        video_url: videoUrl,
        error_message: null
      });

      return res.status(200).json({
        success: true,
        status: "completed",
        progress: 100,
        videoUrl
      });
    }

    // ----------------------------------
    // UNKNOWN STATUS
    // ----------------------------------

    return res.status(200).json({
      success: true,
      status: "generating",
      falStatus: status.status,
      progress: Number(job.progress || 75)
    });

  } catch (error) {
    console.error(
      "CHECK VIDEO GENERATION ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        "Unable to check video generation."
    });
  }

  // ----------------------------------
  // SUPABASE UPDATE HELPER
  // ----------------------------------

  async function updateJob(values) {
    const authHeader =
      req.headers.authorization || "";

    const accessToken =
      authHeader.replace("Bearer ", "").trim();

    const userResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const user = await userResponse.json();

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/video_jobs` +
        `?id=eq.${encodeURIComponent(jobId)}` +
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
          ...values,
          updated_at:
            new Date().toISOString()
        })
      }
    );

    if (!response.ok) {
      const details = await response.text();

      throw new Error(
        `Could not update video job: ${details}`
      );
    }
  }
}
