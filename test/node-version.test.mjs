import test from "node:test";
import assert from "node:assert/strict";
import { isSupportedNode, nodeMajor } from "../scripts/node-version.mjs";

test("nodeMajor parses plain and v-prefixed Node versions", () => {
  assert.equal(nodeMajor("22.22.3"), 22);
  assert.equal(nodeMajor("v24.1.0"), 24);
  assert.equal(nodeMajor("not-a-version"), null);
});

test("isSupportedNode enforces the Node 22 runtime floor", () => {
  assert.equal(isSupportedNode("21.7.3"), false);
  assert.equal(isSupportedNode("22.0.0"), true);
  assert.equal(isSupportedNode("24.1.0"), true);
});
