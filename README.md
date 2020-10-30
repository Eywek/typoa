<div align="center">

  # toag
  ## **T**ypescript **O**pen**A**PI **G**enerator

  This tools is inspired from [tsoa](https://github.com/lukeautry/tsoa), the purpose is to be able to generate openapi definitions and express routes definitions via Typescript typings.

  We're using [ts-morph](https://github.com/dsherret/ts-morph) under the hood.
</div>

## Why

Tsoa is working fine for simple typescript typings, which I think are the principal use case, It's used by many developers and It's maintained.

**BUT**, I've used tsoa in production projects and I've encountered many issues (I was able to [fix](https://github.com/lukeautry/tsoa/pulls?q=is%3Apr+sort%3Aupdated-desc+is%3Amerged+author%3AEywek) some of them), but when I've tried to use more complex types (inheritance, deep generics, conditionnal types...) tsoa wasn't able to provide me good openapi definitions, and without even telling me it failed to generate the right schema.

I've spent a lot of time trying to fix those issues, using tricks to have a workaround. But it was never perfect, I've ended with too many duplicated types only because tsoa was not able to resolve correct typings. I wasn't confident when updating my models and I was always checking that the swagger wasn't broken.

And all of this issues are caused by the custom type resolver of tsoa, in this package we're using `ts-morph`, it allows us to build a resolver more resilient that handle all cases without maintenance on our side.

## Features

- Generate express router via typescript decorators in controllers
- Generate openapi definition via typescript typings
- Allowing to export custom types to openapi schema
- Runtime validation against openapi schema
- Use jsdoc for additionnal configuration (example, regex...)
- Handle getters only and readonly properties

## Work in progress

- [ ] Documentation
- [ ] HTTP Validation and parsing (query params to number, validate types, discriminator validation, readOnly validation)
- [ ] Express router codegen
