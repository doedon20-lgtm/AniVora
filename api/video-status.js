// AniVora Video Job Status API

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://rurwrecfmbsobqsqiepo.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_slKGnhr4gZJchooJEWE0tQ_2Wdz4t3O";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  try {
    // -----------------------------
    // Check Authorization
    // -----------------------------
    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Missing authorization token."
      });
    }

    const accessToken = authHeader.replace("Bearer ", "").trim();

    // -----------------------------
    // Verify Supabase user
    // -----------------------------
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

    // -----------------------------
    // Get job ID
    // -----------------------------
    const { jobId } = req.query;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: "jobId is required."
      });
    }

    // -----------------------------
    // Get the video job
    // -----------------------------
    const jobResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/video_jobs?id=eq.${encodeURIComponent(
        jobId
      )}&user_id=eq.${encodeURIComponent(user.id)}&select=*`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!jobResponse.ok) {
      const errorText = await jobResponse.text();

      return res.status(500).json({
        success: false,
        error: "Unable to retrieve video job.",
        details: errorText
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
    // Return clean job information
    // -----------------------------
    return res.status(200).json({
      success: true,

      job: {
        id: job.id,
        projectId: job.project_id,
        title: job.title,

        status: job.status,
        progress: Number(job.progress || 0),

        videoUrl: job.video_url || null,
        errorMessage: job.error_message || null,

        totalDuration: Number(job.total_duration || 0),
        sceneCount: Number(job.scene_count || 0),

        settings: job.settings || {},
        scenes: job.scenes || [],

        createdAt: job.created_at,
        updatedAt: job.updated_at
      }
    });

  } catch (error) {
    console.error("VIDEO STATUS ERROR:", error);

    return res.status(500).json({
      success: false,
      error: "Unexpected server error."
    });
  }
      }
