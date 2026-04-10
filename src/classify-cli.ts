#!/usr/bin/env node
// === Aura Classifier CLI ===
// Reads response text from stdin, runs the classifier, writes JSON to output file.
// Used by the Stop hook: hooks/classify-response.sh

import { createHash } from "crypto";
import { writeFileSync } from "fs";
import { classify } from "./classifier.js";

const OUTPUT_PATH =
  process.env.AURA_CLASSIFIER_OUTPUT ?? "/tmp/aura-classifier.json";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function main(): Promise<void> {
  const text = (await readStdin()).trim();
  if (!text) {
    process.exit(0);
  }

  const result = classify(text);
  const textHash = "sha256:" + createHash("sha256").update(text).digest("hex");

  const output = {
    timestamp: new Date().toISOString(),
    ...result,
    text_hash: textHash,
  };

  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
}

main().catch((err) => {
  console.error("[aura-classify]", err);
  process.exit(1);
});
