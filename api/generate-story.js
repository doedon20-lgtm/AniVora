module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      error: "OpenAI API key is not configured."
    });
  }

  try {
    const {
      idea,
      contentType,
      tone,
      length,
      projectTitle
    } = req.body || {};

    if (!idea || !idea.trim()) {
      return res.status(400).json({
        error: "Please enter a story idea."
      });
    }

    const prompt = `
You are AniVora Writer, an AI storytelling assistant.

Create a completely ORIGINAL story or script based on the creator's idea.

Project:
${projectTitle || "Untitled Project"}

Content type:
${contentType || "Anime Story"}

Tone:
${tone || "Cinematic"}

Length:
${length || "Medium"}

Creator's idea:
${idea}

Requirements:
- Make the story completely original.
- Do not copy existing anime, movies, manga, books, games, or TV shows.
- Create original characters, locations, conflicts, dialogue and events.
- Make the story engaging and cinematic.
- Give characters clear motivations.
- Make the writing suitable for a content creator.
- If this is a YouTube script, create a strong opening hook.
- If this is a short-form script, keep the pacing fast.
- If dialogue is needed, clearly identify the speakers.
- Do not explain your process.
- Return only the finished story/script.
`;

    const response = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          input: prompt
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("OpenAI error:", data);

      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "OpenAI could not generate the story."
      });
    }

    let generatedText = "";

    if (typeof data.output_text === "string") {
      generatedText = data.output_text;
    }

    if (!generatedText && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (!Array.isArray(item.content)) continue;

        for (const content of item.content) {
          if (
            content.type === "output_text" &&
            typeof content.text === "string"
          ) {
            generatedText += content.text;
          }
        }
      }
    }

    generatedText = generatedText.trim();

    if (!generatedText) {
      return res.status(500).json({
        error: "The AI returned an empty response."
      });
    }

    return res.status(200).json({
      success: true,
      content: generatedText
    });

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Something went wrong while generating your story."
    });
  }
};
