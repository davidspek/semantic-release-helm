import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { prepare, publish, verifyConditions } from "../dist/index.js";

const originalPath = process.env.PATH;
const originalHelmLog = process.env.HELM_LOG;

let root;
let chartDirectory;
let helmLog;

const logger = {
  log() {},
};

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "semantic-release-helm-"));
  chartDirectory = path.join(root, "chart");
  helmLog = path.join(root, "helm.log");
  const binDirectory = path.join(root, "bin");

  await mkdir(chartDirectory);
  await mkdir(binDirectory);
  await writeFile(
    path.join(chartDirectory, "Chart.yaml"),
    "apiVersion: v2\nname: smoke-chart\nversion: 1.2.3\nappVersion: 4.5.6\n",
  );

  const helmPath = path.join(binDirectory, "helm");
  await writeFile(helmPath, "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$HELM_LOG\"\n");
  await chmod(helmPath, 0o755);

  process.env.PATH = `${binDirectory}${path.delimiter}${originalPath}`;
  process.env.HELM_LOG = helmLog;
});

afterEach(async () => {
  process.env.PATH = originalPath;
  if (originalHelmLog === undefined) {
    delete process.env.HELM_LOG;
  } else {
    process.env.HELM_LOG = originalHelmLog;
  }
  await rm(root, { force: true, recursive: true });
});

test("exports semantic-release lifecycle functions", () => {
  assert.equal(typeof verifyConditions, "function");
  assert.equal(typeof prepare, "function");
  assert.equal(typeof publish, "function");
});

test("prepares chart and app versions from the next release", async () => {
  await prepare(
    {
      chartDirectory: "chart",
      versionUpdatePolicy: "sync",
      appVersionUpdatePolicy: "sync",
      ociRegistry: "registry.example.invalid/charts",
    },
    {
      cwd: root,
      logger,
      nextRelease: {
        version: "2.0.0",
        type: "major",
      },
    },
  );

  const chart = await readFile(path.join(chartDirectory, "Chart.yaml"), "utf8");
  assert.match(chart, /^version: 2\.0\.0$/m);
  assert.match(chart, /^appVersion: 2\.0\.0$/m);
});

test("verifies OCI credentials with Helm", async () => {
  await verifyConditions(
    {
      chartDirectory: "chart",
      versionUpdatePolicy: "sync",
      appVersionUpdatePolicy: "sync",
      ociRegistry: "registry.example.invalid",
    },
    {
      cwd: root,
      env: {
        HELM_REGISTRY_USERNAME: "smoke-user",
        HELM_REGISTRY_PASSWORD: "smoke-password",
      },
      logger,
    },
  );

  const commands = await readFile(helmLog, "utf8");
  assert.match(
    commands,
    /^registry login --username smoke-user --password smoke-password registry\.example\.invalid$/m,
  );
});

test("publishes a chart to an OCI registry", async () => {
  await publish(
    {
      chartDirectory: "chart",
      versionUpdatePolicy: "sync",
      appVersionUpdatePolicy: "sync",
      ociRegistry: "registry.example.invalid/charts",
    },
    {
      cwd: root,
      logger,
    },
  );

  const commands = await readFile(helmLog, "utf8");
  assert.match(commands, new RegExp(`^package ${chartDirectory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  assert.match(
    commands,
    /^push smoke-chart-1\.2\.3\.tgz oci:\/\/registry\.example\.invalid\/charts$/m,
  );
});
