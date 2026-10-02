/**
 * AI 客户端：通过 base-url / api-key 调用大模型（OpenAI 兼容接口）
 * 默认适配智谱 GLM：POST {baseUrl}/chat/completions
 */

export class AIClient {
  constructor(config) {
    this.config = config;
  }

  /**
   * 解析实际请求地址
   * 支持用户填写：
   *   - https://open.bigmodel.cn/api/paas/v4
   *   - https://open.bigmodel.cn/api/paas/v4/chat/completions
   *   - https://xxx/v1
   */
  _endpoint() {
    let base = (this.config.baseUrl || '').trim().replace(/\/+$/, '');
    if (!base) throw new Error('未配置 base-url');
    if (/\/chat\/completions$/.test(base)) return base;
    if (/\/v\d+$/.test(base)) return `${base}/chat/completions`;
    // 有些 base 形如 https://api.xxx.com，则补 /v1
    if (!/\/v\d+(\/|$)/.test(base)) return `${base}/v1/chat/completions`;
    return `${base}/chat/completions`;
  }

  /**
   * 发送对话请求
   * @param {Array<{role:string, content:string}>} messages
   * @param {{json?:boolean, temperature?:number, maxTokens?:number}} [opts]
   * @returns {Promise<string>}
   */
  async chat(messages, opts = {}) {
    const { apiKey, model, temperature, timeout } = this.config;
    if (!apiKey || !apiKey.trim()) throw new Error('未配置 api-key');

    const controller = new AbortController();
    const timer = timeout ? setTimeout(() => controller.abort(), timeout) : null;

    const body = {
      model: model || 'glm-4-flash',
      messages,
      temperature: opts.temperature ?? temperature ?? 0.3,
      stream: false,
    };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;

    try {
      const res = await fetch(this._endpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail = '';
        try {
          const errJson = await res.json();
          detail = errJson?.error?.message || JSON.stringify(errJson);
        } catch {
          detail = await res.text().catch(() => '');
        }
        throw new Error(`请求失败 (${res.status}): ${detail || res.statusText}`);
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('响应格式异常：未获取到内容');
      }
      return content;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('请求超时');
      if (e instanceof TypeError) {
        throw new Error('网络请求失败（可能是 CORS 或 base-url 错误）');
      }
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** 测试连通性 */
  async test() {
    const reply = await this.chat(
      [{ role: 'user', content: '请只回复两个字：正常' }],
      { maxTokens: 16, temperature: 0 },
    );
    return reply.trim();
  }
}

export function createAIClient(settings) {
  return new AIClient({
    baseUrl: settings.get('ai.baseUrl'),
    apiKey: settings.get('ai.apiKey'),
    model: settings.get('ai.model'),
    temperature: settings.get('ai.temperature'),
    timeout: settings.get('ai.timeout'),
  });
}
