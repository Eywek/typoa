import { Controller, Route, Get, Query } from '../../../src'

enum Status {
  ONLINE = 100,
  OFFLINE = 200
}

enum Weight {
  LOW,
  MEDIUM,
  HIGH
}

enum Country {
  GERMANY = 'de_DE',
  FRANCE = 'fr_FR',
  ITALY = 'it_IT'
}

interface Container {
  country: Country
  weight: Weight
  currentStatus: Status
}

const containers: Container[] = [
  {
    country: Country.GERMANY,
    weight: Weight.LOW,
    currentStatus: Status.OFFLINE
  },
  {
    country: Country.ITALY,
    weight: Weight.MEDIUM,
    currentStatus: Status.ONLINE
  },
  {
    country: Country.FRANCE,
    weight: Weight.HIGH,
    currentStatus: Status.ONLINE
  }
]

@Route('/xenum-var-names-test')
export class XEnumVarnamesTestController extends Controller {
  @Get('/container')
  getContainer(@Query('country') country: Country): Container | undefined {
    return containers.find(c => c.country === country)
  }
}
