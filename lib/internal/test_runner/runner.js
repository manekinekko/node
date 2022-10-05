'use strict';
const {
  ArrayFrom,
  ArrayPrototypeFilter,
  ArrayPrototypeForEach,
  ArrayPrototypeIncludes,
  ArrayPrototypeJoin,
  ArrayPrototypePush,
  ArrayPrototypeSlice,
  ArrayPrototypeSort,
  Boolean,
  ObjectAssign,
  PromisePrototypeThen,
  SafePromiseAll,
  SafeSet,
  StringPrototypeRepeat,
} = primordials;

const { spawn } = require('child_process');
const { readdirSync, statSync } = require('fs');
const console = require('internal/console/global');
const {
  codes: { ERR_TEST_FAILURE },
} = require('internal/errors');
const { validateArray } = require('internal/validators');
const {
  getInspectPort,
  isUsingInspector,
  isInspectorMessage,
} = require('internal/util/inspector');
const { kEmptyObject } = require('internal/util');
const { createTestTree } = require('internal/test_runner/harness');
const { kSubtestsFailed, Test } = require('internal/test_runner/test');

const useRegexTapParser = Boolean(process.env.REGEX_TAP_PARSER);
const { TapParser } = useRegexTapParser ?
  require('internal/test_runner/tap_parser_regex') :
  require('internal/test_runner/tap_parser');

const { TokenKind } = require('internal/test_runner/tap_lexer');
const { kDefaultIndent } = require('internal/test_runner/tap_stream');

const {
  isSupportedFileType,
  doesPathMatchFilter,
} = require('internal/test_runner/utils');
const { basename, join, resolve } = require('path');
const { once } = require('events');
const { exitCodes: { kGenericUserError } } = internalBinding('errors');

const kFilterArgs = ['--test'];

// TODO(cjihrig): Replace this with recursive readdir once it lands.
function processPath(path, testFiles, options) {
  const stats = statSync(path);

  if (stats.isFile()) {
    if (
      options.userSupplied ||
      (options.underTestDir && isSupportedFileType(path)) ||
      doesPathMatchFilter(path)
    ) {
      testFiles.add(path);
    }
  } else if (stats.isDirectory()) {
    const name = basename(path);

    if (!options.userSupplied && name === 'node_modules') {
      return;
    }

    // 'test' directories get special treatment. Recursively add all .js,
    // .cjs, and .mjs files in the 'test' directory.
    const isTestDir = name === 'test';
    const { underTestDir } = options;
    const entries = readdirSync(path);

    if (isTestDir) {
      options.underTestDir = true;
    }

    options.userSupplied = false;

    for (let i = 0; i < entries.length; i++) {
      processPath(join(path, entries[i]), testFiles, options);
    }

    options.underTestDir = underTestDir;
  }
}

function createTestFileList() {
  const cwd = process.cwd();
  const hasUserSuppliedPaths = process.argv.length > 1;
  const testPaths = hasUserSuppliedPaths ?
    ArrayPrototypeSlice(process.argv, 1) :
    [cwd];
  const testFiles = new SafeSet();

  try {
    for (let i = 0; i < testPaths.length; i++) {
      const absolutePath = resolve(testPaths[i]);

      processPath(absolutePath, testFiles, { userSupplied: true });
    }
  } catch (err) {
    if (err?.code === 'ENOENT') {
      console.error(`Could not find '${err.path}'`);
      process.exit(kGenericUserError);
    }

    throw err;
  }

  return ArrayPrototypeSort(ArrayFrom(testFiles));
}

function filterExecArgv(arg) {
  return !ArrayPrototypeIncludes(kFilterArgs, arg);
}

function getRunArgs({ path, inspectPort }) {
  const argv = ArrayPrototypeFilter(process.execArgv, filterExecArgv);
  if (isUsingInspector()) {
    ArrayPrototypePush(argv, `--inspect-port=${getInspectPort(inspectPort)}`);
  }
  ArrayPrototypePush(argv, path);
  return argv;
}

class FileTest extends Test {
  #buffer = [];
  #handleReportItemRegex(data) {
    const indent = StringPrototypeRepeat(
      kDefaultIndent,
      (data.nesting ?? 0) + 1
    );
    let details;
    if ('yamlLines' in data) {
      details = {
        __proto__: null,
        yaml:
          `${indent}  ` +
          ArrayPrototypeJoin(data.yamlLines, `\n${indent}  `) +
          '\n',
      };
    }
    switch (data.type) {
      case 'version':
        break;
      case 'plan':
        this.reporter.plan(indent, data.count);
        break;
      case 'subtest':
        this.reporter.subtest(indent, data.name);
        break;
      case 'ok':
        this.reporter.ok(
          indent,
          data.testNumber,
          data.name,
          details,
          data.directive
        );
        break;
      case 'not ok':
        this.reporter.fail(
          indent,
          data.testNumber,
          data.name,
          details,
          data.directive
        );
        break;
      case 'unknown':
        this.reporter.diagnostic(kDefaultIndent, data.line);
        break;
      case 'diagnostic':
        if (indent === kDefaultIndent) {
          // Ignore file top level diagnostics
          break;
        }
        this.reporter.diagnostic(indent, data.message);
        break;
    }
  }
  #handleReportItemLL({ kind, node, nesting = 0, lexeme, tokens }) {
    const indent = StringPrototypeRepeat(kDefaultIndent, nesting + 1);

    const details = (diagnostic) => {
      return (
        diagnostic && {
          __proto__: null,
          yaml:
            `${indent}  ` +
            ArrayPrototypeJoin(diagnostic, `\n${indent}  `) +
            '\n',
        }
      );
    };

    switch (kind) {
      case TokenKind.TAP_VERSION:
        // TODO(manekinekko): handle TAP version
        // this.reporter.version(node.version);
        break;

      case TokenKind.TAP_PLAN:
        this.reporter.plan(indent, node.plan.end - node.plan.start + 1);
        break;

      case TokenKind.TAP_SUBTEST_POINT:
        this.reporter.subtest(indent, node.name);
        break;

      case TokenKind.TAP_TEST_OK:
      case TokenKind.TAP_TEST_NOTOK:
        // eslint-disable-next-line no-case-declarations
        const { todo, skip, pass } = node.test.status;
        // eslint-disable-next-line no-case-declarations
        let directive = {};

        if (todo) {
          directive = this.reporter.getTodo(node.test.reason);
        }

        if (skip) {
          directive = this.reporter.getSkip(node.test.reason);
        }

        if (pass) {
          this.reporter.ok(
            indent,
            node.test.id,
            node.test.description,
            null,
            directive
          );
        } else {
          this.reporter.fail(
            indent,
            node.test.id,
            node.test.description,
            null,
            directive
          );
        }
        break;

      case TokenKind.TAP_YAML_START:
        break; // skip

      case TokenKind.TAP_YAML_END:
        this.reporter.details(indent, details(node.diagnostics));
        break;

      case TokenKind.COMMENT:
        if (indent === kDefaultIndent) {
          // Ignore file top level diagnostics
          break;
        }
        this.reporter.diagnostic(indent, node.comment);
        break;

      case TokenKind.UNKNOWN:
        this.reporter.diagnostic(indent, node.value);
        break;
    }
  }
  #handleReportItem(data) {
    if (useRegexTapParser) {
      this.#handleReportItemRegex(data);
    } else {
      this.#handleReportItemLL(data);
    }
  }
  addToReport(ast) {
    if (!this.isClearToSend()) {
      this.#buffer.push(ast);
      return;
    }
    this.reportSubtest();
    this.#handleReportItem(ast);
  }
  report() {
    this.reportSubtest();
    ArrayPrototypeForEach(this.#buffer, (ast) => this.#handleReportItem(ast));
    super.report();
  }
}

function runTestFile(path, root, inspectPort) {
  const subtest = root.createSubtest(FileTest, path, async (t) => {
    const args = getRunArgs({ path, inspectPort });

    const child = spawn(process.execPath, args, {
      signal: t.signal,
      encoding: 'utf8',
    });

    let err;
    let failedSubtests = 0;

    const parser = new TapParser();
    child.stderr.pipe(parser).on('data', (ast) => {
      if (ast.lexeme && isInspectorMessage(ast.lexeme)) {
        process.stderr.write(ast.lexeme + '\n');
      }
    });

    child.stdout.pipe(parser).on('data', (ast) => {
      if (ast.kind === TokenKind.TAP_TEST_NOTOK) {
        failedSubtests++;
      }

      subtest.addToReport(ast);
    });

    const { 0: code, 1: signal } = await once(child, 'exit', {
      signal: t.signal,
    });

    if (code !== 0 || signal !== null) {
      if (!err) {
        const subtestString = `subtest${failedSubtests !== 1 ? 's' : ''}`;
        const msg = `${failedSubtests} ${subtestString} failed`;
        err = ObjectAssign(new ERR_TEST_FAILURE(msg, kSubtestsFailed), {
          __proto__: null,
          exitCode: code,
          signal: signal,
          // The stack will not be useful since the failures came from tests
          // in a child process.
          stack: undefined,
        });
      }

      throw err;
    }
  });
  return subtest.start();
}

function run(options) {
  if (options === null || typeof options !== 'object') {
    options = kEmptyObject;
  }
  const { concurrency, timeout, signal, files, inspectPort } = options;

  if (files != null) {
    validateArray(files, 'options.files');
  }

  const root = createTestTree({ concurrency, timeout, signal });
  const testFiles = files ?? createTestFileList();

  PromisePrototypeThen(
    SafePromiseAll(testFiles, (path) => runTestFile(path, root, inspectPort)),
    () => root.postRun()
  );

  return root.reporter;
}

module.exports = { run };
