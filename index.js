const base64 = require('js-base64');
const {customAlphabet} = require('nanoid');
const nanoid = customAlphabet('1234567890abcdefABCDEF', 32);
const rp = require('request-promise');
const fs = require('fs');

class SberQr {
  constructor(
    {
      client_id,
      client_secret,
      pkcs12_filename,
      pkcs12_password,
      member_id,
      terminal_id,
      sbp_member_id,
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
      sbp_member_id,
    };
  }

  __generateRqUID() {
    return nanoid();
  }

  __getAgentOptions() {
    return {
      pfx: Buffer.isBuffer(this.config.pkcs12_filename) ? this.config.pkcs12_filename : fs.readFileSync(this.config.pkcs12_filename),
      passphrase: this.config.pkcs12_password,
    };
  }

  async getToken(scope) {
    const form = {
      grant_type: 'client_credentials',
      scope: scope,
    };

    let client_id = this.config.client_id;

    const rqUID = this.__generateRqUID();

    let reqOptions = {
      method: 'POST',
      url: 'https://api.sberbank.ru:8443/prod/tokens/v2/oauth',
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        RqUID: rqUID,
        'Authorization': `Basic ${this.config.encoded_cred}`,
        'x-ibm-client-id': client_id,
      },
      form,
      agentOptions: this.__getAgentOptions(),
    };

    let token;
    await rp(reqOptions)
      .then(res => JSON.parse(res))
      .then(res => {
        token = res;
      });

    return {
      token,
      rqUID,
    };
  }

  /**
   * Создать заказ на оплату
   *
   * @param {{order_sum: number, order_number: string, description: string, currency: string}} options_param
   */
  async creteOrder(options_param) {
    const {token, rqUID} = await this.getToken('https://api.sberbank.ru/qr/order.create');

    const date = new Date().toISOString().slice(0, 19) + 'Z';
    let order_sum = options_param.order_sum * 100; // в копейках!!

    let reqOptions = {
      url: 'https://api.sberbank.ru:8443/prod/qr/order/v3/creation',
      method: 'POST',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${token.access_token}`,
        'x-Introspect-RqUID': rqUID,
        'RqUID': rqUID,
        'X-IBM-Client-Id': this.config.client_id,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rq_uid: rqUID,
        rq_tm: date,
        member_id: this.config.member_id,
        order_number: options_param.order_number,
        order_create_date: date,
        order_params_type: options_param.order_params_type,
        id_qr: this.config.terminal_id,
        order_sum,
        currency: options_param.currency,
        description: options_param.description,
        sbp_member_id: this.config.sbp_member_id,
      }),
      agentOptions: this.__getAgentOptions(),
    };

    let order_info;
    await rp(reqOptions)
      .then(res => JSON.parse(res))
      .then(res => {
        order_info = res;
      });

    return order_info;
  };

  /**
   * Узнать статус оплаты
   *
   * @param {{partner_order_number: string, order_id: string}} args
   *
   * order_id - номер заказа в сбере присвоенный сбером
   * partner_order_number - номер заказа присвоенный при создании нами в методе creteOrder
   */
  async getOrderStatus(args) {
    const {token, rqUID} = await this.getToken('https://api.sberbank.ru/qr/order.status');

    const reqOptions = {
      url: 'https://api.sberbank.ru:8443/prod/qr/order/v3/status',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        'x-Introspect-RqUID': `${rqUID}`,
        'RqUID': rqUID,
        'X-IBM-Client-Id': `${this.config.client_id}`,
        'Content-type': 'application/json',
      },
      body: JSON.stringify({
        rq_uid: rqUID,
        rq_tm: `${new Date().toISOString().slice(0, 19) + 'Z'}`,
        order_id: args.order_id,
        "tid": this.config.terminal_id,
        "partner_order_number": args.partner_order_number,
      }),
      agentOptions: this.__getAgentOptions(),
    };

    let status;
    await rp(reqOptions)
      .then(res => JSON.parse(res))
      .then(res => {
        status = res;
      });

    return status;
  }
}

module.exports = SberQr;
