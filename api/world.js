module.exports = async function (req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  try {
    const source = await fetch('https://remotive.com/api/remote-jobs', {
      redirect: 'error', signal: AbortSignal.timeout(12000)
    });
    if (!source.ok) throw Error('Feed unavailable');
    const {jobs} = await source.json();
    const openings = jobs.filter(job => {
      const url = new URL(job.url);
      return url.origin === 'https://remotive.com' && url.pathname.startsWith('/remote-jobs/');
    }).map(job => ({
      title: job.title, company: job.company_name, location: job.candidate_required_location,
      url: job.url, skills: job.tags || [], source: 'Remotive', remote: true,
      worldwide: /^(worldwide|anywhere(?: in the world)?)$/i.test(job.candidate_required_location.trim())
    }));
    res.setHeader('Cache-Control','public, s-maxage=21600, stale-while-revalidate=3600');
    return res.json(openings);
  } catch {
    return res.status(503).json({error:'Remotive is unavailable.'});
  }
};
