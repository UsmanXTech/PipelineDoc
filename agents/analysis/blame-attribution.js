const githubClient = require('../../integrations/github/client');

/**
 * Attributes blame for a pipeline failure by inspecting the commit history of the affected files.
 */
async function attributeBlame({ owner, repo, commitSha, affectedFile }) {
  try {
    // 1. Get info on the commit that triggered the build
    let triggerCommit = null;
    let authorEmail = null;
    let authorName = null;

    try {
      triggerCommit = await githubClient.getCommit(owner, repo, commitSha);
      if (triggerCommit && triggerCommit.commit) {
        authorEmail = triggerCommit.commit.author.email;
        authorName = triggerCommit.commit.author.name;
      }
    } catch (e) {
      console.warn(`Could not fetch triggering commit details for SHA ${commitSha}:`, e.message);
    }

    // Default blame output is the triggering commit author
    const blame = {
      author_email: authorEmail || 'unknown@domain.com',
      author_name: authorName || 'Unknown Author',
      commit_sha: commitSha,
      blame_confidence: 50 // Default confidence if we just blame the pusher
    };

    // 2. If we have a diagnosed affected file, look at its history
    if (affectedFile && affectedFile !== 'null') {
      const history = await githubClient.getFileCommits(owner, repo, affectedFile, 5);
      
      if (history && history.length > 0) {
        const recentAuthors = history.map(c => ({
          sha: c.sha,
          author: c.commit.author.name,
          email: c.commit.author.email,
          message: c.commit.message
        }));

        // If the triggering commit is indeed the last commit that edited this file:
        const wasLastEditor = recentAuthors[0].sha === commitSha;
        
        if (wasLastEditor) {
          blame.blame_confidence = 90; // High confidence if they directly edited the file that broke
        } else {
          // If someone else touched it very recently, check who it was
          // Maybe it's a regression or dependent break
          const matchingCommit = recentAuthors.find(c => c.sha === commitSha);
          if (matchingCommit) {
            blame.blame_confidence = 70; // Medium-high confidence
          } else {
            // The file was not modified in the current commit, meaning it broke due to side effects
            // Let's suggest the last editor of the file as a secondary contact
            blame.author_email = recentAuthors[0].email;
            blame.author_name = recentAuthors[0].author;
            blame.blame_confidence = 60; // Secondary blame on the last person who edited the failing module
            blame.side_effect_origin = true;
          }
        }
        blame.file_history = recentAuthors;
      }
    }

    return blame;
  } catch (error) {
    console.error('Error in blame attribution:', error.message);
    return {
      author_email: 'error@domain.com',
      author_name: 'System Error',
      commit_sha: commitSha,
      blame_confidence: 0,
      error: error.message
    };
  }
}

module.exports = {
  attributeBlame
};
