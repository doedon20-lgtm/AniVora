// AniVora → fal.ai connection test

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  try {
    const falKey = process.env.FAL_KEY;

    if (!falKey) {
      return res.status(500).json({
        success: false,
        error: "FAL_KEY is not configured on Vercel."
      });
    }

    // Ask fal.ai for the authenticated user's account information.
    const response = await fetch("https://api.fal.ai/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Key ${falKey}`
      }
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: "fal.ai rejected the API request.",
        details: text
      });
    }

    return res.status(200).json({
      success: true,
      message: "AniVora is successfully connected to fal.ai.",
      falResponse: text
    });

  } catch (error) {
    console.error("FAL TEST ERROR:", error);

    return res.status(500).json({
      success: false,
      error: "Unable to connect to fal.ai.",
      details: error.message
    });
  }
      }
