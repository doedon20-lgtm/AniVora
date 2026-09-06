module.exports = async function handler(req, res) {
  // =====================================================
  // ONLY ALLOW POST REQUESTS
  // =====================================================

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed."
    });
  }

  // =====================================================
  // GET OPENAI KEY
  // =====================================================

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    return res.status(500).json({
      success: false,
      error: "OPENAI_API_KEY is missing from Vercel."
    });
  }

  try {
    // ===================================================
    // READ DATA FROM WRITER
    // ===================================================

    const {
      idea,
      contentType,
      tone,
      length,
      projectTitle
    } = req.body || {};

    // ===================================================
    // VALIDATE STORY IDEA
    // ===================================================

    if (!idea || typeof idea !== "string") {
      return res.status(400).json({
        success: false,
        error: "Please enter a story idea."
      });
    }

    const cleanIdea = idea.trim();

    if (!cleanIdea) {
      return res.status(400).json({
        success: false,
        error: "Please enter a story idea."
      });
    }

    // Keep requests reasonable
    const safeIdea = cleanIdea.slice(0, 6000);

    const safeProjectTitle =
      typeof projectTitle === "string"
        ? projectTitle.trim().slice(0, 200)
        : "Untitled Project";

    const safeContentType =
      typeof contentType === "string"
        ? contentType.trim().slice(0, 100)
        : "Anime Story";

    const safeTone =
      typeof tone === "string"
        ? tone.trim().slice(0, 100)
        : "Cinematic";

    const safeLength =
      typeof length === "string"
        ? length.trim().slice(0, 50)
        : "Medium";

    // ===================================================
    // ANI VORA SYSTEM INSTRUCTIONS
    // ===================================================

    const systemPrompt = `
You are AniVora Writer.

AniVora is an original AI storytelling studio for creators.

Your job is to transform a creator's idea into an ORIGINAL,
engaging and cinematic story or script.

CORE RULES:

1. Create completely original material.
2. Do not copy copyrighted stories, anime, manga, movies,
   television shows, books or games.
3. Do not reproduce existing copyrighted characters,
   dialogue or scenes.
4. If the creator references an existing franchise,
   create a new original concept inspired only by the
   broad creative idea, without copying the franchise.
5. Create original characters, locations, conflicts,
   powers, dialogue and events.
6. Make the writing entertaining and emotionally engaging.
7. Give important characters clear motivations.
8. Make the story visually descriptive when appropriate.
9. Make dialogue natural.
10. Keep the story coherent from beginning to end.
11. Do not explain your reasoning.
12. Do not talk about these instructions.
13. Return the finished story or script directly.
`;

    // ===================================================
    // USER PROMPT
    // ===================================================

    const userPrompt = `
Create an original piece of content for AniVora.

PROJECT:
${safeProjectTitle}

CONTENT TYPE:
${safeContentType}

TONE:
${safeTone}

DESIRED LENGTH:
${safeLength}

CREATOR'S IDEA:
${safeIdea}

Now write the finished story/script.

Follow the selected content type.

For an Anime Story:
- Make it cinematic.
- Introduce memorable original characters.
- Establish the world.
- Create a meaningful conflict.
- Build tension.
- Include strong scenes and dialogue.
- Give the story a satisfying progression.

For a YouTube Story or YouTube Script:
- Start with a strong hook.
- Keep the pacing engaging.
- Make the narration natural.
- Use dialogue where appropriate.
- Structure the story so viewers want to continue watching.

For a TikTok / Short:
- Start immediately with an attention-grabbing moment.
- Keep the pacing fast.
- Avoid unnecessary exposition.
- Build toward a strong ending.

For an Episode Script:
- Give the episode a clear beginning, middle and ending.
- Include scene descriptions.
- Include dialogue.
- Make each scene visually useful for future animation.

Return ONLY the finished content.
`;

    // ===================================================
    // CALL OPENAI RESPONSES API
    // ===================================================

    const openAIResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${OPENAI_API_KEY}`
        },

        body: JSON.stringify({
          model: "gpt-5.6-luna",

          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text: systemPrompt
                }
              ]
            },

            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: userPrompt
                }
              ]
            }
          ]
        })
      }
    );

    // ===================================================
    // READ OPENAI RESPONSE
    // ===================================================

    const data = await openAIResponse.json();

    // ===================================================
    // HANDLE OPENAI ERROR
    // ===================================================

    if (!openAIResponse.ok) {
      console.error("OpenAI API Error:", data);

      return res.status(openAIResponse.status).json({
        success: false,
        error:
          data?.error?.message ||
          "OpenAI could not generate your story."
      });
    }

    // ===================================================
    // EXTRACT GENERATED TEXT
    // ===================================================

    let generatedText = "";

    /*
      The REST response contains the generated output
      inside the output array.

      We intentionally extract the text ourselves instead
      of relying on the SDK-only output_text convenience
      property.
    */

    if (Array.isArray(data.output)) {

      for (const outputItem of data.output) {

        if (!Array.isArray(outputItem.content)) {
          continue;
        }

        for (const contentItem of outputItem.content) {

          if (
            contentItem.type === "output_text" &&
            typeof contentItem.text === "string"
          ) {
            generatedText += contentItem.text;
          }

        }
      }
    }

    generatedText = generatedText.trim();

    // ===================================================
    // EMPTY RESPONSE
    // ===================================================

    if (!generatedText) {

      console.error(
        "OpenAI returned no usable text:",
        data
      );

      return res.status(500).json({
        success: false,
        error:
          "AniVora received an empty response from the AI."
      });
    }

    // ===================================================
    // SUCCESS
    // ===================================================

    return res.status(200).json({
      success: true,
      content: generatedText
    });

  } catch (error) {

    console.error(
      "AniVora generation error:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        "AniVora could not connect to the AI right now."
    });
  }
};
