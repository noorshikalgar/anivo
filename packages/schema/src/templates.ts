/** The built-in templates (FR-FILE-08). Files: assets/templates/<name>.anivo.json. */
export const TEMPLATES = [
  { name: "load-balancer", title: "How a load balancer works", description: "Requests flow round-robin to three pods; a pod fails and comes back." },
  { name: "tcp-handshake", title: "TCP three-way handshake", description: "SYN, SYN-ACK, and ACK between a client and a server." },
  { name: "docker-layers", title: "Docker image layers", description: "Layers stack up; a code change rebuilds only the top layer." },
  { name: "git-branch-merge", title: "Git branch and merge", description: "Commits on main, a feature branch, a merge, and a camera zoom." },
  { name: "database-index", title: "How a database index works", description: "A full table scan, then the rows morph into an index tree." },
  { name: "http-request", title: "What happens when you open a URL", description: "DNS lookup, connection, request, database query, and response." },
  { name: "cache-aside", title: "Cache-aside pattern", description: "Cache miss, read from the database, fill the cache, cache hit." },
  { name: "message-queue", title: "Message queue", description: "A producer publishes, workers consume, and a worker fails." },
  { name: "ci-cd-pipeline", title: "CI/CD pipeline", description: "Commit, build, test, and deploy to production." },
  { name: "oauth-login", title: "OAuth 2.0 login", description: "A sequence diagram of the authorization code flow." },
] as const;

export type TemplateName = (typeof TEMPLATES)[number]["name"];
