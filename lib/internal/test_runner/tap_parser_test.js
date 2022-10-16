'use strict';

const util = require('util');
const { TapParser } = require('./tap_parser');

function TAP(input) {
  const parser = new TapParser(input, {debug: true});
  const ast = parser.parse();

  console.log(`------------------------------`);
  console.log(util.inspect(ast, { depth: 6, colors: true }));
  return parser;
}

//-------------TESTS-------------//

// TAP(`
// TAP version 14
// 1..4
// `);


// TAP(`


// TAP version 14


// 1..4


// `);

// TAP(`TAP version 14
// 1..4 # this is a description
// `);

// TAP(`
// TAP version 14
// 1..4 # reason for plan "\\ !"\\#$%&'()*+,\\-./:;<=>?@[]^_\`{|}~"
// `);

// TAP(`
// TAP version 14
// 1..4 # reason for plan
// ok
// `);

// TAP(`
// TAP version 14
// 1..4 # reason for plan ok not ok not
// ok
// `);

// TAP(`
// TAP version 14
// 1..4 # reason for plan ok not
// ok 1 this is a test
// `);

// TAP(`
// TAP version 14
// 1..4 # description for test plan ok TAP version 14
// ok 1 this is an ok test
// ok 2 - this is  a test ok
// not ok - 3 this is a not ok test
// ok 4 this is a test`);

// TAP(`
// TAP version 14
// 1..4
// ok 1 - this is an ok test
// ok 2 this is  a test ok
// not ok 3 this is a not ok test
// ok 4 this is a test`);

// TAP(`
// TAP version 14
// 1..4
// ok 1 - hello \\# \\\\ world # TODO escape \\# characters with \\\\
// ok foo bar
// `);

// TAP(`
// TAP version 14
// 1..8



// # description: hello
// # todo: true
// ok 1 - hello # todo

// # description: hello # todo
// # todo: false
// ok 2 - hello \\# todo

// # description: hello
// # todo: true
// # todo reason: hash # character
// ok 3 - hello # todo hash \\# character
// # (assuming "character" isn't a known custom directive)
// ok 4 - hello # todo hash # character

// # description: hello \
// # todo: true
// # todo reason: hash # character
// ok 5 - hello \\\\# todo hash \\# character
// # (assuming "character" isn't a known custom directive)
// ok 6 - hello \\\\# todo hash # character

// # description: hello # description # todo
// # todo: false
// # (assuming "description" isn't a known custom directive)
// ok 7 - hello # description # todo

// # multiple escaped \ can appear in a row
// # description: hello \\\# todo
// # todo: false
// ok 8 - hello \\\\\\\\\\\\\\# todo
// `);

// TAP(`
// ok  - hello # # # # #
// not ok  - hello # \\#


// # skip: true
// ok 7 - do it later # Skipped

// `);


// TAP(`
// TAP version 14
// 1..4
// ok
// `);

// TAP(`
// 1..4
// TAP version 14
// ok
// `);

// TAP(`
// ok
// 1..4
// TAP version 14
// `);

// TAP(`
// ok
//   ---
//   message: "Failed with error 'hostname peebles.example.com not found'"
//   severity: fail
//   found:
//     hostname: 'peebles.example.com'
//     address: ~
//   wanted:
//     hostname: 'peebles.example.com'
//     address: '85.193.201.85'
//   at:
//     file: test/dns-resolve.c
//     line: 142
//   ...

// ok
//   ---
//   severity: none
//   at:
//     file: test/dns-resolve.c
//     line: 142
//   ...
// `);

// TAP(`
// ok
// Bail out! Couldn't connect to database.
// `);

// TAP(`
// TAP version 14
// # tell the parser to bail out on any failures from now on
// pragma +bail

// # tell the parser to execute in strict mode, treating any invalid TAP
// # line as a test failure.
// pragma +strict

// # turn off a feature we don't want to be active right now
// pragma -bail
// `);

// TAP(`
// pragma +strict, -foo
// `);

// subtests

TAP(`
ok 1 - subtest test point 1
    not ok 2 - subtest test point 2
        ok 3 - subtest test point 3 # todo
            ok 4 - subtest test point 4 # skip because
`);

TAP(`
            ok 4 - subtest test point 4 # skip because
        ok 3 - subtest test point 3 # todo
    not ok 2 - subtest test point 2
ok 1 - subtest test point 1
`);

TAP(`
# Subtest: foo.tap
    not ok 1 - subtest test point 1
ok 1 - foo.tap
`);

TAP(`
TAP version 14
1..2
pragma +strict, -foo

# Subtest: foo.tap

    TAP version 143
    pragma -strict, +foo, -bar
    1..2
    ok 1
    # diagnostic for subtests is not supported
      ---
      foo2: bar2
      ...
    ok 2 - this passed
    # bail out is supported
    Bail out! Couldn't connect to database.

ok 1 - foo.tap
# diagnostic for tests is supported
  ---
  foo1: bar1
  ...
Bail out! Error: Couldn't connect to database.
`);
