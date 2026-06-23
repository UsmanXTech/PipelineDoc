const { triggerTestSuite, pollTestResults } = require('../backend/integrations/uipath/test-cloud');
require('dotenv').config();

async function run() {
  const suiteId = process.env.UIPATH_SUITE_ID || '12345';
  console.log(`Starting UiPath Test Cloud suite: ${suiteId}`);
  
  try {
    const triggerResult = await triggerTestSuite(suiteId, 'Production');
    console.log(`Triggered test execution: ${triggerResult.executionId}`);
    
    console.log('Polling test results (this might take up to 2 minutes)...');
    const report = await pollTestResults(triggerResult.executionId, 120000);
    
    console.log(`Test Execution completed with status: ${report.status}`);
    console.log(`Total Tests: ${report.totalTests}`);
    console.log(`Passed: ${report.passed}`);
    console.log(`Failed: ${report.failed}`);
    console.log(`Flaky: ${report.flaky}`);
    
    if (report.status === 'Failed' || report.failed > 0) {
      console.error('❌ UiPath Test Suite failed.');
      process.exit(1);
    }
    
    console.log('✅ UiPath Test Suite passed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during UiPath Test Suite execution:', err.message);
    process.exit(1);
  }
}

run();
