// AniVora Video Processing Controller
// This controls the asynchronous video-generation pipeline.

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://rurwrecfmbsobqsqiepo.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_slKGnhr4gZJchooJEWE0tQ_2Wdz4t3O";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  try {
    // ----------------------------------
    // Authorization
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
        method: "GET",
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
    // Read request
    // ----------------------------------
    const { jobId } = req.body || {};

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: "jobId is required."
      });
    }

    // ----------------------------------
    // Get the user's video job
    // ----------------------------------
    const jobResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/video_jobs` +
      `?id=eq.${encodeURIComponent(jobId)}` +
      `&user_id=eq.${encodeURIComponent(user.id)}` +
      `&select=*`,
      {
        method: "GET",
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
    // Don't process an already completed job
    // ----------------------------------
    if (job.status === "completed") {
      return res.status(200).json({
        success: true,
        message: "Video job is already completed.",
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        videoUrl: job.video_url || null
      });
    }

    // ----------------------------------
    // Helper: update job
    // ----------------------------------
    async function updateJob(values) {
      const response = await fetch(
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
            ...values,
            updated_at: new Date().toISOString()
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
          `Failed to update video job: ${errorText}`
        );
      }
    }

    // ----------------------------------
    // Stage 1
    // ----------------------------------
    await updateJob({
      status: "processing",
      progress: 10,
      error_message: null
    });

    // ----------------------------------
    // Stage 2: Prepare scenes
    // ----------------------------------
    await updateJob({
      status: "preparing_scenes",
      progress: 25
    });

    // ----------------------------------
    // Stage 3: Prepare audio
    // ----------------------------------
    await updateJob({
      status: "preparing_audio",
      progress: 40
    });

    // ----------------------------------
    // Stage 4: Prepare timeline
    // ----------------------------------
    await updateJob({
      status: "building_timeline",
      progress: 55
    });

    // ----------------------------------
    // Stage 5: Ready for rendering
    // ----------------------------------
    await updateJob({
      status: "ready_for_render",
      progress: 70
    });

    // ----------------------------------
    // IMPORTANT
    //
    // We stop here intentionally.
    //
    // The next layer will connect:
    //
    // scene generation
    // voice generation
    // music/SFX
    // actual video renderer
    // storage
    //
    // We do NOT create a fake video URL.
    // ----------------------------------

    return res.status(200).json({
      success: true,
      message: "Video job prepared for rendering.",
      jobId: job.id,
      status: "ready_for_render",
      progress: 70,
      nextStep: "render"
    });

  } catch (error) {
    console.error("PROCESS VIDEO ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Video processing failed."
    });
  }
  }
