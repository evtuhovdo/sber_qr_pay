const base64 = require('js-base64');
const {customAlphabet} = require('nanoid');
const nanoid = customAlphabet('1234567890abcdefABCDEF', 32);
const rp = require('request-promise');

const fs = require('fs');

module.exports = class {
  constructor(
    {
      client_id,
      client_secret,
      pkcs12_filename,
      pkcs12_password,
      member_id,
      terminal_id,
    },
  ) {
    const encoded_cred = base64.encode(`${client_id}:${client_secret}`);

    this.config = {
      client_id,
      client_secret,
      encoded_cred,
      pkcs12_filename,
      pkcs12_password,
      member_id,
      terminal_id,
    };

    this.urls = {
      access_token_url: 'https://api.sberbank.ru:8443/prod/tokens/v2/oauth',
    };
  }

  generateRqUID() {
    return nanoid();
  }

  async getToken(scope) {
    let config = this.config;

    const agentOptions = {
      pfx: config.pkcs12_filename,
      passphrase: config.pkcs12_password,
    };

    const form = {
      grant_type: 'client_credentials',
      scope: scope,
    };

    let client_id = config.client_id;

    const rqUID = this.generateRqUID();

    let reqOptions = {
      method: 'POST',
      url: this.urls.access_token_url,
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        RqUID: rqUID,
        'Authorization': `Basic ${config.encoded_cred}`,
        'x-ibm-client-id': client_id,
      },
      form,
      agentOptions: {
        pfx: Buffer.isBuffer(agentOptions.pfx) ? agentOptions.pfx : fs.readFileSync(agentOptions.pfx),
        passphrase: agentOptions.passphrase,
      },
    };

    const token = await rp(reqOptions)
      .then(res => JSON.parse(res));

    return {
      token,
      rqUID,
    };
  }

  async creteOrder(options_param, token, RqUID, config) {
    const agentOptions = {
      pfx: config.pkcs12_filename,
      passphrase: config.pkcs12_password,
    };

    const date = new Date().toISOString().slice(0, 19) + 'Z';
    let order_sum = options_param.order_sum * 100; // в копейках

    let reqOptions = {
      url: 'https://api.sberbank.ru:8443/prod/qr/order/v3/creation',
      method: 'POST',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${token.access_token}`,
        'x-Introspect-RqUID': RqUID,
        'RqUID': RqUID,
        'X-IBM-Client-Id': config.client_id,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rq_uid: RqUID,
        rq_tm: date,
        member_id: options_param.member_id,
        order_number: options_param.order_number,
        order_create_date: date,
        order_params_type: options_param.order_params_type,
        id_qr: options_param.id_qr,
        order_sum,
        currency: options_param.currency,
        description: options_param.description,
        'sbp_member_id': '100000000111',
      }),
      agentOptions: {
        pfx: Buffer.isBuffer(agentOptions.pfx) ? agentOptions.pfx : fs.readFileSync(agentOptions.pfx),
        passphrase: agentOptions.passphrase,
      },
    };

    let order_info;
    await rp(reqOptions)
      .then(res => JSON.parse(res))
      .then(res => {
        order_info = res;
      });

    return order_info;
  };

  async getOrderStatus(options, token, RqUID, order_info, config) {
    const agentOptions = {
      pfx: config.pkcs12_filename,
      passphrase: config.pkcs12_password,
    };

    const reqOptions = {
      url: 'https://api.sberbank.ru:8443/prod/qr/order/v3/status',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'x-Introspect-RqUID': `${RqUID}`,
        'RqUID': RqUID,
        'X-IBM-Client-Id': `${config.client_id}`,
        'Content-type': 'application/json',
      },
      body: JSON.stringify({
        rq_uid: RqUID,
        rq_tm: `${new Date().toISOString().slice(0, 19) + 'Z'}`,
        order_id: order_info.order_id,
        "tid": config.terminal_id,
        "partner_order_number": "774635526639"
      }),
      agentOptions: {
        pfx: Buffer.isBuffer(agentOptions.pfx) ? agentOptions.pfx : fs.readFileSync(agentOptions.pfx),
        passphrase: agentOptions.passphrase,
      },
    };

    let status;
    await rp(reqOptions)
      .then(res => JSON.parse(res))
      .then(res => {
        status = res;
      });

    return status;
  }
};
