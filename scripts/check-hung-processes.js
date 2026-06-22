const { execSync } = require('child_process');

function parseElapsedTime(etime) {
  let days = 0, hours = 0, minutes = 0, seconds = 0;
  
  if (etime.includes('-')) {
    const parts = etime.split('-');
    days = parseInt(parts[0], 10) || 0;
    etime = parts[1] || '';
  }
  
  const timeParts = etime.split(':');
  if (timeParts.length === 3) {
    hours = parseInt(timeParts[0], 10) || 0;
    minutes = parseInt(timeParts[1], 10) || 0;
    seconds = parseInt(timeParts[2], 10) || 0;
  } else if (timeParts.length === 2) {
    minutes = parseInt(timeParts[0], 10) || 0;
    seconds = parseInt(timeParts[1], 10) || 0;
  } else if (timeParts.length === 1) {
    seconds = parseInt(timeParts[0], 10) || 0;
  }
  
  return (days * 24 * 3600) + (hours * 3600) + (minutes * 60) + seconds;
}

try {
  console.log('Checking for hung node test runner processes...');
  const output = execSync('ps -eo pid,etime,args').toString();
  const lines = output.split('\n');
  
  let foundHung = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Format: PID ETIME ARGS
    // We match space-separated columns, but ARGS can have spaces, so we grab the first two words and the rest
    const match = trimmed.match(/^(\d+)\s+([\d\-:]+)\s+(.+)$/);
    if (!match) continue;
    
    const pid = parseInt(match[1], 10);
    const etimeStr = match[2];
    const args = match[3];
    
    // We check if this is a node test command or npm test run
    // But we don't want to kill our own checker script!
    const isTestProcess = (args.includes('node') && (args.includes('--test') || args.includes('tests/'))) || args.includes('npm test');
    const isSelf = args.includes('check-hung-processes.js');
    
    if (isTestProcess && !isSelf) {
      const elapsedSeconds = parseElapsedTime(etimeStr);
      console.log(`Found test process: PID ${pid}, Elapsed: ${elapsedSeconds}s, CMD: "${args}"`);
      
      // Kill if running for more than 5 minutes (300 seconds)
      if (elapsedSeconds > 300) {
        console.log(`[KILLING] Process ${pid} has been running for too long (${elapsedSeconds}s).`);
        try {
          process.kill(pid, 'SIGKILL');
          foundHung = true;
        } catch (e) {
          console.error(`Failed to kill process ${pid}: ${e.message}`);
        }
      }
    }
  }
  
  if (!foundHung) {
    console.log('No hung test processes detected.');
  }
} catch (err) {
  console.error('Error running check-hung-processes:', err.message);
}
