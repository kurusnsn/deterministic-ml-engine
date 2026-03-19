const { ApiCheck, AssertionBuilder } = require('checkly/constructs')

new ApiCheck('chessvector-frontend-uptime', {
  name: 'ChessVector Frontend',
  alertChannels: [],
  request: {
    url: 'https://chessvector.com',
    method: 'GET',
    followRedirects: true,
    skipSSL: false,
    assertions: [AssertionBuilder.statusCode().equals(200)],
  },
})

new ApiCheck('chessvector-api-healthz', {
  name: 'ChessVector API /healthz',
  alertChannels: [],
  request: {
    url: 'https://api.chessvector.com/healthz',
    method: 'GET',
    followRedirects: true,
    skipSSL: false,
    assertions: [AssertionBuilder.statusCode().equals(200)],
  },
})
