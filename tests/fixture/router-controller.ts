import express from 'express'
import { Controller, Route, Get, Post, Header, Body, Request, Query, Delete, Path, Patch, BodyDiscriminatorFunction, Security, Hidden } from '../../src'

enum EnumString {
  FOO = 'foo',
  BAR = 'bar'
}

enum EnumNumber {
  FOO = 4,
  BAR = 6
}

type BodyTypeOne = {
  type: 'one'
}

interface BodyTypeTwo {
  type: 'two'
}

class WithInitializer {
  public foo = 'bar'
}

// tslint:disable-next-line: max-classes-per-file
@Route('my-controller')
@Hidden()
export class MyController extends Controller {
  @Get()
  public async get () {
    throw new Error('My get error')
  }

  @Post()
  public async post (
    @Header('x-custom-header') header: string,
    @Body() body: {
      string: string,
      /**
       * @pattern [A-Z]+
       */
      stringWithPattern: string,
      stringWithFormat: Date,
      stringEnum: EnumString,
      nullable: string | null,
      number: number,
      /**
       * @minimum 4
       * @maximum 10
       */
      numberWithMinAndMax: number
      numberEnum: EnumNumber
      boolean: boolean
      tuple: [string, number]
      array: string[]
      object: {}
      record: Record<string, string>
      mappedType: { [key: string]: number }
      objectWithProps: {
        string: string
        number?: number
      },
      union: { foo: 'bar' } | { bar: 'foo' }
      intersection: { foo: 'bar' } & { bar: 'foo' }
      readonly readonlyProp: string
      any?: any
      unknown?: unknown
      class: WithInitializer
      anyOnly: any
      unionAdditionalProps: { foo: string } | { foo: string, bar: string }
    },
    @Request() req: express.Request,
    @Query('my-query-param') queryParam?: string,
    @Query('my-default-param') defaultParam: EnumString = EnumString.FOO,
    @Query('my-bool') bool: boolean = false
  ) {
    this.setStatus(201)
    this.setHeader('x-foo', 'bar')
    return Object.assign({}, body, { url: req.url, formatIsDate: body.stringWithFormat instanceof Date, queryParam, defaultParam, bool })
  }

  @Delete('{id}/{boolean(0|1)}')
  public async delete (
    @Path('id') id: number,
    @Path('boolean') bool: boolean,
    @Query('limit') limit = 20
  ) {
    return { id, bool, limit }
  }

  @Patch()
  public async patch (
    @Body('application/json', discriminatorFn) body: BodyTypeOne | BodyTypeTwo
  ) {
    return body
  }

  @Get('/intercepted')
  @Security({ company: ['read'] })
  public async getIntercepted () {
    return
  }

  @Get('/no-content')
  public async noContent () {
    return
  }

  @Post('/file')
  public async file (
    @Body('multipart/form-data') body: {
      /**
       * @format binary
       */
      file: string
    }
  ) {
    return 'ok'
  }
}

export const discriminatorFn: BodyDiscriminatorFunction = async (req) => typeof req.query.one === 'string' ? 'BodyTypeOne' : 'BodyTypeTwo'
