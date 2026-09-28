# Tests

## How To Read The Test Names

_Drafted by Niyaz Malik. If you see a clearer way to explain this, feel free to edit._

In this directory, "behavior" describes the intent of the tests. These tests are written in business terms, so they ask what the enrolment flow should do in a given situation.

"Contract", "service", and "integration" describe the level of the test.

A contract test is the smallest kind of behavior test. It checks a rule as input and output data without needing the real Nest service flow or a real database.

A service test checks one service method with mocked dependencies. It is useful when the main question is whether one service makes the right business decisions.

An integration test checks whether the real services, repositories, and database rows work together correctly. That is why the private enrolment create -> review -> confirm test is called an integration test. It is still behavior-focused, but it proves the real persisted graph rather than just one mocked service.

An end-to-end test would go one level higher than this and drive the flow through the HTTP API. That is not what the current enrolment integration test is doing.

## DB-Backed Test Safety

Real-MySQL tests use the shared guard in `tests/support/controlled-test-database.ts` before TypeORM may synchronize a schema. The guard fails unless:

- `TEST_DB_ALLOW_SYNC=1` is set explicitly;
- `NODE_ENV=test`;
- the database follows the controlled `smw_*_test*` naming rule;
- the host is loopback or explicitly listed in `TEST_DB_ALLOWED_HOSTS`;
- the connection uses a non-privileged test username.

Use a dedicated disposable schema and restricted database user. Never point these tests at an application, shared-development, staging, or production database. Error output identifies only the safe target fields and never echoes the password or full DSN.
