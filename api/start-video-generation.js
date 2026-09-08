const SUPABASE_URL =
  "https://rurwrecfmbsobqsqiepo.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_slKGnhr4gZJchooJEWE0tQ_2Wdz4t3O";

const MODEL = "fal-ai/vidu/q3/text-to-video";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({
        success: false,
        error: "Method not allowed."
      });
    }

    const falKey = process.env.FAL_KEY;

    if (!falKey) {
      return res.status(500).json({
        success: false,
        error: "FAL_KEY is not configured in Vercel."
      });
    }

    // --------------------------------------------------
    // AUTH
    // --------------------------------------------------

    const authHeader = req.headers.authorization || "";

    if (!authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        error: "Missing authentication token."
      });
    }

    const accessToken = authHeader.substring(7);

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
      const authText = await userResponse.text();

      console.error("SUPABASE AUTH ERROR:", authText);

      return res.status(401).json({
        success: false,
        error: "Invalid authentication session."
      });
    }

    const user = await userResponse.json();

    // --------------------------------------------------
    // REQUEST BODY
    // --------------------------------------------------

    const {
      jobId,
      projectId,
      title,
      script,
      scenes,
      settings
    } = req.body || {};

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: "jobId is required."
      });
    }

    // --------------------------------------------------
    // GET VIDEO JOB
    // --------------------------------------------------

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
      const jobText = await jobResponse.text();

      console.error("VIDEO JOB FETCH ERROR:", jobText);

      return res.status(500).json({
        success: false,
        error: "Could not load the video job."
      });
    }

    const jobs = await jobResponse.json();

    if (!Array.isArray(jobs) || jobs.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Video job not found."
      });
    }

    const job = jobs[0];

    // --------------------------------------------------
    // GET FIRST SCENE
    // --------------------------------------------------

    let jobScenes = [];

    if (Array.isArray(scenes) && scenes.length > 0) {
      jobScenes = scenes;
    } else if (Array.isArray(job.scenes)) {
      jobScenes = job.scenes;
    }

    if (jobScenes.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No scenes were found for this video."
      });
    }

    const firstScene = jobScenes[0];

    const sceneDescription =
      firstScene.description ||
      firstScene.prompt ||
      firstScene.text ||
      firstScene.content ||
      "A cinematic anime scene.";

    // --------------------------------------------------
    // SAFE PROMPT
    // --------------------------------------------------

    let prompt = `
Create a cinematic anime-style animated scene.

Scene:
${sceneDescription}

Visual direction:
High-quality anime animation, expressive characters,
detailed environment, cinematic composition,
smooth natural movement, dramatic lighting,
consistent character appearance, polished animation.

Camera movement should be smooth and cinematic.
The scene should look like a professionally produced anime.
`.trim();

    // fal.ai allows a maximum of 2000 characters.
    prompt = prompt.substring(0, 2000);

    // --------------------------------------------------
    // FIXED SAFE TEST SETTINGS
    // --------------------------------------------------

    const duration = 5;
    const aspectRatio = "16:9";
    const resolution = "360p";
    const audio = false;

    console.log("====================================");
    console.log("ANIVORA FAL VIDEO REQUEST");
    console.log("MODEL:", MODEL);
    console.log("DURATION:", duration);
    console.log("ASPECT:", aspectRatio);
    console.log("RESOLUTION:", resolution);
    console.log("AUDIO:", audio);
    console.log("PROMPT LENGTH:", prompt.length);
    console.log("====================================");

    // --------------------------------------------------
    // SEND REQUEST TO FAL
    // --------------------------------------------------

    const falResponse = await fetch(
      `https://queue.fal.run/${MODEL}`,
      {
        method: "POST",
        headers: {
          Authorization: `Key ${falKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt,
          duration,
          aspect_ratio: aspectRatio,
          resolution,
          audio
        })
      }
    );

    const falText = await falResponse.text();

    console.log("FAL HTTP STATUS:", falResponse.status);
    console.log("FAL RESPONSE:", falText);

    let falData;

    try {
      falData = JSON.parse(falText);
    } catch {
      falData = {
        raw: falText
      };
    }

    // --------------------------------------------------
    // FAL REJECTED REQUEST
    // --------------------------------------------------

    if (!falResponse.ok) {
      console.error(
        "FAL REQUEST REJECTED:",
        JSON.stringify(falData)
      );

      return res.status(400).json({
        success: false,
        error:
          falData?.detail ||
          falData?.message ||
          falData?.error ||
          "fal.ai rejected the video generation request.",
        falStatus: falResponse.status,
        falResponse: falData
      });
    }

    // --------------------------------------------------
    // GET REQUEST ID
    // --------------------------------------------------

    const requestId =
      falData.request_id ||
      falData.requestId ||
      falData.id;

    if (!requestId) {
      console.error(
        "FAL DID NOT RETURN REQUEST ID:",
        falData
      );

      return res.status(500).json({
        success: false,
        error: "fal.ai did not return a request ID.",
        falResponse: falData
      });
    }

    // --------------------------------------------------
    // SAVE FAL REQUEST ID
    // --------------------------------------------------

    const oldSettings =
      job.settings && typeof job.settings === "object"
        ? job.settings
        : {};

    const newSettings = {
      ...oldSettings,

      falRequestId: requestId,
      falModel: MODEL,
      falStatus: "IN_QUEUE",
      falStartedAt: new Date().toISOString()
    };

    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/video_jobs?id=eq.${encodeURIComponent(
        jobId
      )}&user_id=eq.${encodeURIComponent(user.id)}`,
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
      const updateText = await updateResponse.text();

      console.error(
        "VIDEO JOB UPDATE ERROR:",
        updateText
      );

      return res.status(500).json({
        success: false,
        error: "Video generation started, but the job could not be updated."
      });
    }

    // --------------------------------------------------
    // SUCCESS
    // --------------------------------------------------

    return res.status(202).json({
      success: true,
      message: "AI video generation started.",
      jobId,
      projectId: projectId || job.project_id || null,
      requestId,
      status: "generating",
      progress: 75,
      model: MODEL
    });

  } catch (error) {
    console.error(
      "START VIDEO GENERATION ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error?.message ||
        "Unexpected server error while starting video generation."
    });
  }
        }
