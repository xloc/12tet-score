import { FollowingSearch, type SearchRequest, type SearchResponse } from './following-search';

let search: FollowingSearch | undefined;
let generation = 0;
let job: { id: number; iterator: ReturnType<FollowingSearch['search']> } | undefined;
let scheduled = false;

function schedule() {
  if (scheduled || !job) return;
  scheduled = true;
  setTimeout(run, 0);
}

function run() {
  scheduled = false;
  const deadline = performance.now() + 8;
  while (job && performance.now() < deadline) {
    const step = job.iterator.next();
    if (step.done) {
      const response: SearchResponse = { generation, id: job.id, candidates: step.value };
      postMessage(response);
      job = undefined;
    }
  }
  schedule();
}

onmessage = (event: MessageEvent<SearchRequest>) => {
  const request = event.data;
  if (request.type === 'init') {
    generation = request.generation;
    search = new FollowingSearch(request.reference);
    job = undefined;
  } else if (request.generation === generation && search) {
    job = { id: request.id, iterator: search.search(request.pitches) };
    schedule();
  }
};
