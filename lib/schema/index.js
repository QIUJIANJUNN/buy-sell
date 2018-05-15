const graphql = require('graphql')
const request = require('superagent')
const _ = require('lodash')
const moment = require('moment')

const {
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLSchema,
  GraphQLList,
  GraphQLNonNull,
  GraphQLFloat,
} = graphql

const Price = new GraphQLObjectType({
  name: 'PriceType',
  fields: {
    name: { type: GraphQLString },
    price: { type: GraphQLInt },
  }
})

const OrderDetail = new GraphQLObjectType({
  name: 'OrderDetail',
  fields: {
    // total: { type: GraphQLFloat },
    count: { type: GraphQLFloat },
    price: { type: GraphQLFloat },
  }
})



const OrderBookPair = new GraphQLObjectType({
  name: 'OrderBookPair',
  fields: {
    currencyPair: { type: GraphQLString },
    platform: { type: GraphQLString },
    // buys: { type: GraphQLList(OrderDetail) },
    // sells: { type: GraphQLList(OrderDetail) },
    highestSell: { type: OrderDetail },
    lowestBuy: { type: OrderDetail },
  }
})

const Strategy = new GraphQLObjectType({
  name: 'Strategy',
  fields: {
    aProfit: { type: GraphQLFloat },
    // aProfitAmount: { type: GraphQLFloat },
    aFromBtcToEth: { type: GraphQLFloat },
    aHaveSameProfitOfEthYouNeedEthUsdtBuyOf: { type: GraphQLFloat },
    bProfit: { type: GraphQLFloat },
  },
})

const orderbookByCurrencyPairDataFromCobinhood = currencyPair =>
request
.get(`https://api.cobinhood.com/v1/market/orderbooks/${currencyPair}`)
.then(res => {
  const { bids, asks } = res.body.result.orderbook
  const isDesc = true
  const sortedBuys = _.orderBy(
    bids.map((x) => ({
      count: _.toNumber(x[2]),
      price: _.toNumber(x[0]),
    })),
    ['price'],
    [isDesc ? 'desc' : 'asc'],
  )
  const sortedSells = _.orderBy(
    asks.map((x) => ({
      count: _.toNumber(x[2]),
      price: _.toNumber(x[0]),
    })),
    ['price'],
    [isDesc ? 'desc' : 'asc'],
  )
  return ({
    currencyPair,
    platform: 'Cobinhood',
    highestSell: _.last(sortedSells),
    lowestBuy: _.first(sortedBuys),
  })
})

const orderbookByCurrencyPairDataFromBinance = currencyPair =>
  request
  .get(`https://www.binance.com/api/v1/depth?symbol=${currencyPair.split('-').join('')}`)
  .then(res => {
    const { bids, asks } = res.body
    const isDesc = true
    const sortedBuys = _.orderBy(
      bids.map((x) => ({
        count: _.toNumber(x[1]),
        price: _.toNumber(x[0]),
      })),
      ['price'],
      [isDesc ? 'desc' : 'asc'],
    )
    const sortedSells = _.orderBy(
      asks.map((x) => ({
        count: _.toNumber(x[1]),
        price: _.toNumber(x[0]),
      })),
      ['price'],
      [isDesc ? 'desc' : 'asc'],
    )

    return ({
      currencyPair,
      platform: 'Binance',
      highestSell: _.last(sortedSells),
      lowestBuy: _.first(sortedBuys),
    })
  })

const RootQuery = new GraphQLObjectType({
  name: 'RootQueryType',
  fields: {
    strategy: {
      type: Strategy,
      args: {
        directions: { type: GraphQLList(GraphQLString) },
        netProfitPercentage: { type: GraphQLFloat },
      },
      resolve: (parent, { directions, netProfitPercentage }) => {
        const firstDirection = directions[0]
        const secondDirection = directions[1]
        const thirdDirection = directions[2]

        const firstStepPair = `${firstDirection}-${secondDirection}`
        const secondStepPair = `${firstDirection}-${thirdDirection}`
        const thirdStepPair = `${thirdDirection}-${secondDirection}`
        const currencyPairs = [
          firstStepPair,
          secondStepPair,
          thirdStepPair,
        ]

        return Promise.all(
          currencyPairs
          .map(currencyPair => orderbookByCurrencyPairDataFromCobinhood(currencyPair))
        )
        .then(resultCurrencyPairs => resultCurrencyPairs.map((x,i) => Object.assign({}, x, { currencyPair: currencyPairs[i] }) ))
        .then((resultCurrencyPairs, index) => {
          const fixedETHAmount = 0.01
          const netProfitAmount = (fixedETHAmount / (1 - netProfitPercentage)) - fixedETHAmount
          console.log(netProfitAmount);

          const fixedUsdtAmount = 10

          const aFromEthToUsdt = fixedETHAmount * resultCurrencyPairs[0].lowestBuy.price
          const aFromUsdtToBtc = aFromEthToUsdt / resultCurrencyPairs[2].highestSell.price
          const aFromBtcToEth = aFromUsdtToBtc / resultCurrencyPairs[1].highestSell.price
          const aProfit = aFromBtcToEth - fixedETHAmount

          const bFromUsdtToEth = fixedUsdtAmount / resultCurrencyPairs[0].highestSell.price
          const bFromEthToBtc = bFromUsdtToEth * resultCurrencyPairs[1].lowestBuy.price
          const bFromBtcToUsdt = bFromEthToBtc * resultCurrencyPairs[2].lowestBuy.price
          const bProfit = bFromBtcToUsdt - fixedUsdtAmount

          const aHaveSameProfitOfEthYouNeedEthUsdtBuyOf = fixedETHAmount / (fixedETHAmount + netProfitAmount) * resultCurrencyPairs[2].highestSell.price * resultCurrencyPairs[1].highestSell.price

            // resultCurrencyPairs[0].lowestBuy.price


          // const aBuy = resultCurrencyPairs[0].lowestBuy.price
          // const aSell = resultCurrencyPairs[2].highestSell.price
          // const aExchange = resultCurrencyPairs[1].highestSell.price
          // const aExchangedValue = aBuy / aSell
          // const aResultProfit = (aExchangedValue - aExchange) / aExchangedValue

          // const bSell = resultCurrencyPairs[0].highestSell.price
          // const bBuy = resultCurrencyPairs[1].lowestBuy.price
          // const bExchange = resultCurrencyPairs[1].lowestBuy.price
          // const bExchangedValue = bSell / bBuy
          // const bResultProfit = (bExchangedValue - bExchange) / bExchangedValue

          return ({
            aProfit: aProfit,
            aFromBtcToEth,
            aHaveSameProfitOfEthYouNeedEthUsdtBuyOf,
            bProfit: bProfit,
          })
        })
      }
    },
    orderBookPairs: {
      type: GraphQLList(OrderBookPair),
      args: { currencyPairs: { type: GraphQLList(GraphQLString) } },
      resolve: (parent, { currencyPairs }) =>
        Promise.all(
          [
            ...currencyPairs.map(x => ({ platform: 'Cobinhood', currencyPair: x })),
            ...currencyPairs.map(x => ({ platform: 'Binance', currencyPair: x })),
          ]
          .map(currencyPair => currencyPair.platform === 'Cobinhood'
            ? orderbookByCurrencyPairDataFromCobinhood(currencyPair.currencyPair)
            : orderbookByCurrencyPairDataFromBinance(currencyPair.currencyPair)
          )
        )
    },
    prices: {
      type: new GraphQLList(Price),
      resolve: () => request
        .get('https://api.cobinhood.com/v1/market/currencies')
        .then(res => {
          return res.body.result.currencies.map(x => Object.assign({}, x, { price: 111 }))
        })
        ,
    }
  }
})



module.exports = new GraphQLSchema({
  query: RootQuery,
  
})
