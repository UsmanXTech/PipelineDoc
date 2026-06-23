const anthropic = require('./anthropic');
const gemini = require('./gemini');
require('dotenv').config();

// Helper to determine the configured LLM provider
function getProvider() {
  if (process.env.LLM_PROVIDER === 'gemini') {
    return 'gemini';
  }
  if (process.env.LLM_PROVIDER === 'anthropic') {
    return 'anthropic';
  }
  // Fallbacks based on presence of API keys
  if (process.env.GEMINI_API_KEY) {
    return 'gemini';
  }
  return 'anthropic';
}

/**
 * Maps Claude-formatted messages history to Gemini-compatible contents format.
 */
function mapClaudeMessagesToGemini(messages) {
  const contents = [];
  const toolIdToName = {};

  for (const msg of messages) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const parts = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'text') {
          parts.push({ text: block.text });
        } else if (block.type === 'tool_use') {
          toolIdToName[block.id] = block.name;
          const functionCall = {
            name: block.name,
            args: block.input
          };
          const thoughtSig = block.thought_signature || block.thoughtSignature || block.thought;
          if (thoughtSig) {
            functionCall.thoughtSignature = thoughtSig;
          }
          parts.push({
            functionCall
          });
        } else if (block.type === 'tool_result') {
          // Deduce tool name from ID mapping or parsing
          const name = toolIdToName[block.tool_use_id] || block.tool_use_id.replace(/^call_/, '').replace(/_\d+$/, '');
          let responseData;
          try {
            responseData = JSON.parse(block.content);
          } catch (e) {
            responseData = { result: block.content };
          }
          // Gemini requires the response field to be a JSON object, not an array or primitive
          if (Array.isArray(responseData) || typeof responseData !== 'object' || responseData === null) {
            responseData = { result: responseData };
          }
          parts.push({
            functionResponse: {
              name,
              response: responseData
            }
          });
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  return contents;
}

/**
 * Common method for generating content from LLM provider without tools.
 */
async function generateContent({ system, prompt, maxTokens = 1000, temperature = 0.2 }) {
  const provider = getProvider();

  if (provider === 'gemini') {
    const modelName = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
    const response = await gemini.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: system,
        maxOutputTokens: maxTokens,
        temperature: temperature
      }
    });
    return {
      text: response.text,
      provider: 'gemini',
      model: modelName
    };
  } else {
    const modelName = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
    const response = await anthropic.messages.create({
      model: modelName,
      max_tokens: maxTokens,
      system: system,
      messages: [{ role: 'user', content: prompt }],
      temperature: temperature
    });
    return {
      text: response.content[0].text,
      provider: 'anthropic',
      model: modelName
    };
  }
}

// Drop-in wrapper client mimicking Anthropic SDK interface
const aiClient = {
  getProvider,
  generateContent,
  anthropic,
  gemini,
  messages: {
    async create({ model, max_tokens, system, messages, tools, temperature }) {
      const provider = getProvider();

      if (provider === 'gemini') {
        const modelName = process.env.GEMINI_MODEL || 'gemini-3-flash-preview';
        const contents = mapClaudeMessagesToGemini(messages);

        let geminiTools;
        if (tools && tools.length > 0) {
          geminiTools = [{
            functionDeclarations: tools.map(t => ({
              name: t.name,
              description: t.description,
              parameters: {
                type: 'OBJECT',
                properties: t.input_schema.properties || {},
                required: t.input_schema.required || []
              }
            }))
          }];
        }

        const response = await gemini.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction: system,
            tools: geminiTools,
            maxOutputTokens: max_tokens,
            temperature: temperature
          }
        });

        const content = [];
        if (response.text) {
          content.push({ type: 'text', text: response.text });
        }

        const parts = response.candidates?.[0]?.content?.parts || [];
        let callIndex = 0;
        parts.forEach(part => {
          if (part.functionCall) {
            const call = part.functionCall;
            content.push({
              type: 'tool_use',
              id: `call_${call.name}_${callIndex++}`,
              name: call.name,
              input: call.args,
              thought_signature: call.thoughtSignature || call.thought_signature || call.thought
            });
          }
        });

        return {
          content,
          provider: 'gemini',
          model: modelName
        };
      } else {
        return anthropic.messages.create({
          model: model || 'claude-3-5-sonnet-20241022',
          max_tokens: max_tokens,
          system,
          messages,
          tools,
          temperature
        });
      }
    }
  }
};

module.exports = aiClient;
