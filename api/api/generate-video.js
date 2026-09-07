const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://rurwrecfmbsobqsqiepo.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "sb_publishable_slKGnhr4gZJchooJEWE0tQ_2Wdz4t3O";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  try {
    // --------------------------------------------------
    // AUTHENTICATION
    // --------------------------------------------------

    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "You must be logged in."
      });
    }

    const accessToken = authHeader.replace("Bearer ", "").trim();

    const userResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY
        }
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        success: false,
        error: "Your login session has expired."
      });
    }

    const user = await userResponse.json();

    if (!user || !user.id) {
      return res.status(401).json({
        success: false,
        error: "Unable to verify your account."
      });
    }

    // --------------------------------------------------
    // REQUEST DATA
    // --------------------------------------------------

    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body || {};

    const {
      projectId,
      title,
      script,
      scenes,
      settings
    } = body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: "Project ID is required."
      });
    }

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        error: "Video title is required."
      });
    }

    if (!Array.isArray(scenes) || scenes.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Add at least one scene first."
      });
    }

    // --------------------------------------------------
    // CALCULATE DURATION
    // --------------------------------------------------

    const totalDuration = scenes.reduce((total, scene) => {
      const duration = Number(scene.duration);

      return total + (
        Number.isFinite(duration) && duration > 0
          ? duration
          : 5
      );
    }, 0);

    // --------------------------------------------------
    // CREATE VIDEO JOB
    // --------------------------------------------------

    const job = {
      user_id: user.id,
      project_id: projectId,
      title: title.trim(),
      script: script || "",
      status: "queued",
      progress: 0,
      total_duration: totalDuration,
      scene_count: scenes.length,
      settings: settings || {},
      scenes: scenes,
      video_url: null,
      error_message: null
    };

    const insertResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/video_jobs`,
      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },

        body: JSON.stringify(job)
      }
    );

    if (!insertResponse.ok) {
      const errorText = await insertResponse.text();

      console.error(
        "Supabase video job error:",
        errorText
      );

      return res.status(500).json({
        success: false,
        error: "Could not create the video generation job."
      });
    }

    const createdJobs = await insertResponse.json();

    const createdJob = createdJobs[0];

    // --------------------------------------------------
    // SUCCESS
    // --------------------------------------------------

    return res.status(202).json({
      success: true,

      message:
        "AniVora video generation has been queued.",

      jobId: createdJob.id,

      status: createdJob.status,

      progress: createdJob.progress,

      videoUrl: null
    });

  } catch (error) {
    console.error(
      "AniVora Video API Error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        "Something went wrong while creating your video."
    });
  }
};
