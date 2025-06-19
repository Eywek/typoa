<div align="center">

  <h1>typoa</h1>
  <h2> <b>Typ</b>escript <b>O</b>pen<b>A</b>PI Generator</h2>

  This tools is inspired from [tsoa](https://github.com/lukeautry/tsoa), the purpose is to be able to generate openapi definitions and express routes definitions via Typescript typings.

  We're using [ts-morph](https://github.com/dsherret/ts-morph) under the hood.

  [![codecov](https://codecov.io/gh/Eywek/typoa/branch/main/graph/badge.svg?token=8hLCf5qoDU)](https://codecov.io/gh/Eywek/typoa)
</div>

## Why

Tsoa is a great package and it's working fine for simple typescript typings, which I think are principal use cases, it's used by many developers and maintained.

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

## How to use

### Define your controllers

You only need to add the `@Route()` decorator at the top of your controller class and `@Get()`, `@Post()`... at the top
of each method definition, like this:

```ts
import { Route, Get } from 'typoa'

@Route()
class MyController {
  @Get()
  public get () {}
}
```

You can provide the route path in the `@Route()` decorator or in each verb decorators (eg. `@Get`...) or both.

You also will need to extends the `Controller` class if you want to override the default HTTP status (200 if your method return content, 204 if not):

```ts
import { Route, Get, Controller } from 'typoa'

@Route('/controller-path')
class MyController extends Controller {
  @Get('/method-path')
  public get () {
    this.setStatus(201)
    return 'Created'
  }
}
```

To send data to the client you only need to return your data, `typoa` will use `res.json()` with it.
If you return a stream, `typoa` will stream it to the client.

#### Body, Query, Path, Header and Request

To use the parsed (and validated) body from typoa you only need to provide the `@Body()` decorator:

```ts
import { Route, Get, Controller } from 'typoa'

@Route('/controller-path')
class MyController extends Controller {
  @Post('/method-path')
  public post (
    @Body() body: { name: string }
  ) {
    this.setStatus(201)
    return 'Created'
  }
}
```

This is the same for query parameters (`@Query('<name>')`), path parameters (`@Path('<name>')`) and headers (`@Header('<name>')`).

You also can use the `@Request()` decorator if you need to access the express request.

**Note:** You can see more examples in the `example/` folder.

##### Body discrimination

Sometimes you want to validate the body against a specific schema depending on which resource the user try to update...

To handle that, you can provide a `discriminator function` to the body decorator:

```ts
import { Route, Get, Controller, BodyDiscriminatorFunction } from 'typoa'

type TypeA = { name: string }
type TypeB = { name: number }

// The function need to return the name of the type you want to validate against
export const discriminatorFunction: BodyDiscriminatorFunction = async (req) => 'TypeA'

@Route('/controller-path')
class MyController extends Controller {
  @Post('/method-path')
  public post (
    @Body(
      'application/json', // body content-type
      discriminatorFunction // name of the function you want to use
    ) body: TypeA | TypeB
  ) {
    this.setStatus(201)
    return 'Created'
  }
}
```

### Generate

To generate the openapi definition and the router you will need to bind to express, you only need to call the `generate` method of `typoa`:

```ts
await generate({
  tsconfigFilePath: path.resolve(__dirname, './tsconfig.json'),
  controllers: [path.resolve(__dirname, './*.ts')], // Path of your controllers
  openapi: {
    // Where do you want to generate your openapi file (or array of file paths)
    // The file extension (.json, .yaml, or .yml) determines the output format
    filePath: '/tmp/openapi.json',
    service: { // Used in the openapi definitions
      name: 'my-service',
      version: '1.0.0'
    },
    securitySchemes: { // Openapi securitySchemes definitions
      company: {
        type: 'apiKey',
        name: 'x-company-id',
        in: 'header'
      }
    }
  },
  router: {
    filePath: './router.ts', // Where do you want to generate the router file
    securityMiddlewarePath: './security.ts' // Optional, middleware called if you use the @Security() decorator
  }
})
```
