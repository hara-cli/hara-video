/** Return the integer major from a Node version such as "22.22.3" or "v24.1.0". */
export function nodeMajor(version = process.versions.node) {
  const match = /^v?(\d+)(?:\.|$)/.exec(String(version).trim());
  return match ? Number(match[1]) : null;
}

/** Whether a Node version satisfies hara-video's minimum supported runtime. */
export function isSupportedNode(version = process.versions.node, minimumMajor = 22) {
  const major = nodeMajor(version);
  return major !== null && major >= minimumMajor;
}
