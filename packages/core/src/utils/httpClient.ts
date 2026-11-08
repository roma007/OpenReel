export interface HttpClient {
  get(url: string, options?: HttpOptions): Promise<HttpResponse>;
}

export interface HttpOptions {
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
  /** fetch 的 mode。默认 no-cors 用于浏览器降级场景；读取跨域 JSON（如豆瓣）时需传 'cors'。 */
  mode?: 'cors' | 'no-cors' | 'same-origin' | 'navigate';
}

export interface HttpResponse {
  data: any;
  status: number;
}

let httpClient: HttpClient | null = null;

export function getHttpClient(): HttpClient {
  if (httpClient) return httpClient;
  
  httpClient = createDefaultHttpClient();
  return httpClient;
}

export function setHttpClient(client: HttpClient): void {
  httpClient = client;
}

function createDefaultHttpClient(): HttpClient {
  console.log('[HTTP Client] 使用原生 fetch (可能有CORS限制)');
  
  return {
    async get(url: string, options?: HttpOptions): Promise<HttpResponse> {
      console.log(`[HTTP Client] GET: ${url}`);
      
      const controller = new AbortController();
      const timeout = options?.timeout || 15000;
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      // 合并外部 signal（如取消请求）和内部超时 signal
      if (options?.signal) {
        if (options.signal.aborted) {
          clearTimeout(timeoutId);
          throw new DOMException('The operation was aborted.', 'AbortError');
        }
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ...options?.headers,
          },
          signal: controller.signal,
          mode: options?.mode ?? 'no-cors',
        });
        
        clearTimeout(timeoutId);
        
        console.log(`[HTTP Client] Response: status=${response.status}, type=${response.type}, ok=${response.ok}`);
        
        if (response.type === 'opaque') {
          console.error('[HTTP Client] CORS错误: 收到不透明响应，无法读取数据');
          throw new Error('CORS blocked - 无法访问外部API。请检查网络连接或防火墙设置。');
        }
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // 源站偶发返回未转义的裸控制字符（如 \u0001），JSON.parse 会直接失败。
        // 这里只读一次文本：先直接解析，失败再清洗控制字符重试（不重复缓冲响应体）。
        const rawText = await response.text();
        let data: any;
        try {
          data = JSON.parse(rawText);
        } catch {
          try {
            data = JSON.parse(rawText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' '));
            console.warn('[HTTP Client] JSON 含非法控制字符，已清洗后解析');
          } catch {
            throw new Error(`响应不是合法 JSON：${rawText.slice(0, 80)}`);
          }
        }
        console.log(`[HTTP Client] 成功: ${response.status}, 数据长度: ${JSON.stringify(data).length}`);
        
        return {
          data,
          status: response.status,
        };
      } catch (error) {
        clearTimeout(timeoutId);
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[HTTP Client] 错误: ${errorMsg}`);
        
        // 提供更友好的错误信息
        if (errorMsg.includes('CORS') || errorMsg.includes('opaque')) {
          throw new Error('CORS错误 - 无法访问外部API。Tauri HTTP插件可能未正确加载。');
        }
        if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
          throw new Error('网络错误 - 无法连接到服务器。请检查网络连接。');
        }
        if (errorMsg.includes('abort') || errorMsg.includes('timeout')) {
          throw new Error('请求超时 - 服务器响应时间过长。');
        }
        throw error;
      }
    },
  };
}