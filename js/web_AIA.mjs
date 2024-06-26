import MistralClient from 'https://cdn.skypack.dev/@mistralai/mistralai';
import { createClient } from 'https://cdn.skypack.dev/@supabase/supabase-js';


console.log("web_AIA.mjs module loaded");

const mistralClient = new MistralClient("u2J9xMhy5qFjgpzMaCCT7YnoCIq1kjlH");
const supabase = createClient("https://bewwfdiqefwvthokopxy.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJld3dmZGlxZWZ3dnRob2tvcHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTkyMTk0NTcsImV4cCI6MjAzNDc5NTQ1N30.o5JY0pPTp1Kt_We67jL_WR_G8iwsm7hjRtF8HYKOcao");

const BACKOFF_BASE_MS = 500; // Base backoff time in milliseconds
const BACKOFF_MAX_ATTEMPTS = 2; // Maximum number of retry attempts

export async function backoff(attempt) {
  const delay = BACKOFF_BASE_MS * (2 ** attempt);
  await new Promise(resolve => setTimeout(resolve, delay));
}

export async function processInput(input) {
  if (!input.trim()) {
    return "Ask me anything you wanna know about me!";
  }

  try {
    // 2. Creating an embedding of the input
    const embedding = await createEmbedding(input);
    if (embedding === null) {
      throw new Error("Failed to create embedding for the input");
    }

    // 3. Retrieving similar embeddings / text chunks (aka "context")
    const context = await retrieveMatches(embedding);
    if (context === null) {
      throw new Error("Failed to retrieve matches for the embedding");
    }

    // 4. Combining the input and the context in a prompt and using the chat API to generate a response
    const response = await generateChatResponse(context, input);
    if (response === null) {
      throw new Error("Failed to generate chat response");
    }

    return response;
  } catch (error) {
    console.error(error.message);
    return "I'm sorry, I'm too tired to talk. Please try again later.";
  }
}

async function createEmbedding(input) {
  try {
    const embeddingResponse = await mistralClient.embeddings({
      model: 'mistral-embed',
      input: [input]
    });
    // Check if embeddingResponse has the expected data structure
    if (embeddingResponse?.data && embeddingResponse.data.length > 0 && embeddingResponse.data[0].embedding) {
      return embeddingResponse.data[0].embedding;
    } else {
      throw new Error("Unexpected response structure from the embeddings API");
    }
  } catch (error) {
    console.error(error.message);
    return null;
  }
}

async function retrieveMatches(embedding) {
  try {
    const { data, error } = await supabase.rpc('match_my_resume', {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: 3
    });

    if (error) {
      throw new Error(error.message);
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error("No matching content found");
    }

    return data[0].content; // Assuming data is an array and you want the first element's content
  } catch (error) {
    console.error(error.message);
    return null;
  }
}

async function generateChatResponse(context, query) {
  // Get current date and time
  const currentDate = new Date().toLocaleDateString();
  const currentTime = new Date().toLocaleTimeString();

  // Prompt message including current date and time
  const promptMessage = `Current Date and Time: ${currentDate}, ${currentTime}\n`
                       + `Resume context: ${context} - Question: ${query}`;

  let attempt = 0;
  while (attempt < BACKOFF_MAX_ATTEMPTS) {
    try {
      // Call Mistral AI chat API with streaming
      const chatStreamResponse = await mistralClient.chatStream({
        model: 'mistral-small-latest',
        messages: [
          { role: "system", content: "### YOU are Achintharya YOU MUST only reply everything as Achintharya(yourself) in first person with 'I' ### <<<Reply in a paragraph. YOU MUST be straight-foward, truthful and professional. Ensure that you answer only from the provided context and NEVER hallucinate any information>>> All questions are directed towards Achintharya i.e you. Remember that you are Achintharya and not an AI language model<<<Remember that you know everyhting about Achintharya from the given context but DO NOT mention that you are replying based on the resume."},
          { role: 'user', content: promptMessage }
        ],
        temperature: 0.5, randomSeed: 615, maxTokens: 256
      });

      console.log();
      let finalResponse = '';
      const inputLabelElement = document.querySelector('.input__label'); // Get the input label element
      inputLabelElement.innerHTML = ''; // Clear previous content

      for await (const chunk of chatStreamResponse) {
        const streamText = chunk.choices[0].delta.content;
        if (streamText) {
          inputLabelElement.innerHTML += streamText; // Append the text to the input label element
          finalResponse += streamText;
        }
      }
      return finalResponse;

    } catch (error) {
      if (error.response && error.response.status === 429) {
        attempt++;
        if (attempt < BACKOFF_MAX_ATTEMPTS) {
          await backoff(attempt);
        }
      } else {
        console.error(error.message);
        return "I'm sorry, I'm too tired to talk. Please try again later.";
      }
    }
  }
  // Fallback call to generateChatResponse
  return generateChatResponse(context, "if no known query is detected, ask the user to ask them anything about yourself");
}
