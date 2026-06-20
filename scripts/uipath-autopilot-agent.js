const axios = require('axios');

async function queryChat(message) {
  console.log(`\n💬 [Autopilot Query]: "${message}"`);
  console.log('--- Response Stream ---');
  
  try {
    const response = await axios.post('http://localhost:3000/api/chat', {
      message,
      conversation_history: []
    }, {
      responseType: 'stream'
    });

    return new Promise((resolve, reject) => {
      response.data.on('data', chunk => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.substring(6).trim();
            if (dataStr === '[DONE]') {
              continue;
            }
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.type === 'text') {
                process.stdout.write(parsed.text);
              } else if (parsed.type === 'tool_start') {
                console.log(`\n⚙️ [Calling Tool]: ${parsed.name} with input:`, parsed.input);
              } else if (parsed.type === 'tool_result') {
                console.log(`📊 [Tool Result]:`, parsed.result);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      });

      response.data.on('end', () => {
        console.log('\n-----------------------');
        resolve();
      });

      response.data.on('error', err => {
        reject(err);
      });
    });
  } catch (err) {
    console.error('Autopilot query failed:', err.message);
  }
}

async function run() {
  const query = process.argv[2] || "What's our SLO status?";
  await queryChat(query);
}

if (require.main === module) {
  run();
}

module.exports = { queryChat };
