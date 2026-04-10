async function main() {
  const port = process.env.PORT || '3003';
  const url = `http://localhost:${port}/api/sync`;
  console.log(`POST ${url}`);
  const res = await fetch(url, { method: 'POST' });
  const data = await res.json() as { jobId?: string };
  console.log('Sync started:', data);

  if (data.jobId) {
    console.log(`Monitor: GET http://localhost:${port}/api/sync/status/${data.jobId}`);
  }
}

main().catch(console.error);
