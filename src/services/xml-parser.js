/**
 * XML 解析器
 * 用于解析 sitemap XML 文件
 */

/**
 * 解析 XML 字符串
 * @param {string} xmlString - XML 字符串
 * @returns {Document} DOM 文档对象
 */
export function parseXML(xmlString) {
  const parser = new DOMParser();
  return parser.parseFromString(xmlString, 'text/xml');
}

/**
 * 从 sitemap XML 中提取所有 URL
 * @param {string} xmlContent - sitemap XML 内容
 * @returns {string[]} URL 列表
 */
export function extractURLs(xmlContent) {
  if (!xmlContent) {
    return [];
  }
  // 在Cloudflare Workers环境中，DOMParser不可用。
  // 我们使用更简单、更可靠的正则表达式来提取<loc>标签中的内容。
  const locRegex = /<loc>(.*?)<\/loc>/g;
  const matches = xmlContent.match(locRegex);

  if (!matches) {
    return [];
  }

  return matches.map(match => {
    // 从 <loc>https://example.com</loc> 中提取出 https://example.com
    return match.replace(/<loc>|<\/loc>/g, '').trim();
  });
}

/**
 * 从 sitemap XML 中提取 URL 和最后修改时间
 * @param {string} xmlContent - sitemap XML 内容
 * @returns {Array<{url: string, lastmod?: string}>} URL 和修改时间列表
 */
export function extractURLsWithLastMod(xmlContent) {
  try {
    const doc = parseXML(xmlContent);
    const results = [];

    // 查找所有 <url> 标签
    const urlElements = doc.querySelectorAll('url');

    for (const urlElement of urlElements) {
      const locElement = urlElement.querySelector('loc');
      const lastmodElement = urlElement.querySelector('lastmod');

      if (locElement) {
        const url = locElement.textContent.trim();
        const lastmod = lastmodElement ? lastmodElement.textContent.trim() : undefined;

        if (url) {
          results.push({ url, lastmod });
        }
      }
    }

    return results;
  } catch (error) {
    console.error('解析 XML 失败:', error);
    return [];
  }
}

/**
 * 验证 XML 是否为有效的 sitemap
 * @param {string} xmlContent - XML 内容
 * @returns {boolean} 是否为有效的 sitemap
 */
export function isValidSitemap(xmlContent) {
  try {
    const doc = parseXML(xmlContent);

    // 检查根元素是否为 urlset 或 sitemapindex
    const rootElement = doc.documentElement;
    if (!rootElement || (rootElement.tagName !== 'urlset' && rootElement.tagName !== 'sitemapindex')) {
      return false;
    }

    // 检查是否包含 sitemap 命名空间
    const namespace = rootElement.getAttribute('xmlns');
    if (!namespace || !namespace.includes('sitemaps.org')) {
      return false;
    }

    // 检查是否至少有一个 url 或 sitemap 元素
    const urlElements = doc.querySelectorAll('url');
    const sitemapElements = doc.querySelectorAll('sitemap');
    return urlElements.length > 0 || sitemapElements.length > 0;

  } catch (error) {
    console.error('验证 sitemap 失败:', error);
    return false;
  }
}

/**
 * 检测是否为 sitemap 索引文件
 * @param {string} xmlContent - XML 内容
 * @returns {boolean} 是否为 sitemap 索引
 */
export function isSitemapIndex(xmlContent) {
  try {
    const doc = parseXML(xmlContent);
    const rootElement = doc.documentElement;
    return rootElement && rootElement.tagName === 'sitemapindex';
  } catch (error) {
    console.error('检测 sitemap 索引失败:', error);
    return false;
  }
}

/**
 * 从 sitemap 索引中提取子 sitemap URL
 * @param {string} xmlContent - sitemap 索引 XML 内容
 * @returns {string[]} 子 sitemap URL 列表
 */
export function extractSitemapURLs(xmlContent) {
  try {
    const doc = parseXML(xmlContent);
    const urls = [];

    // 查找所有 sitemap > loc 标签
    const sitemapElements = doc.querySelectorAll('sitemap');

    for (const sitemapElement of sitemapElements) {
      const locElement = sitemapElement.querySelector('loc');
      if (locElement) {
        const url = locElement.textContent.trim();
        if (url) {
          urls.push(url);
        }
      }
    }

    return urls;
  } catch (error) {
    console.error('提取子 sitemap URL 失败:', error);
    return [];
  }
}

/**
 * 递归获取所有实际内容 URL（处理嵌套 sitemap）
 * @param {string} sitemapUrl - sitemap URL
 * @param {number} maxDepth - 最大递归深度，防止无限递归
 * @returns {Promise<string[]>} 所有实际内容 URL
 */
export async function getAllContentURLs(sitemapUrl, maxDepth = 3) {
  console.log(`🔍 [深度 ${4 - maxDepth}] 开始处理: ${sitemapUrl}`);
  
  if (maxDepth <= 0) {
    console.warn(`❌ 达到最大递归深度: ${sitemapUrl}`);
    return [];
  }

  try {
    // 简化的 fetch 请求
    const response = await fetch(sitemapUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SiteBot/1.0)'
      }
    });

    if (!response.ok) {
      console.error(`❌ HTTP 错误 ${response.status}: ${sitemapUrl}`);
      return [];
    }

    console.log(`✅ 成功获取: ${sitemapUrl}`);
    
    let xmlContent = await response.text();
    console.log(`📄 XML 长度: ${xmlContent.length} 字符`);

    // 简单检查是否为 sitemap 索引
    const isIndex = xmlContent.includes('<sitemapindex') || xmlContent.includes('sitemap-posts.xml');
    console.log(`🔍 是否为索引: ${isIndex}`);

    if (isIndex) {
      console.log(`📂 处理 sitemap 索引`);
      
      // 直接提取所有 <loc> 标签内容
      const locMatches = xmlContent.match(/<loc>(.*?)<\/loc>/g) || [];
      const childUrls = locMatches.map(match => 
        match.replace(/<\/?loc>/g, '').trim()
      ).filter(url => url.includes('sitemap') && !url.includes('sitemap.xml'));
      
      console.log(`🔗 找到子 sitemap: ${childUrls.length} 个`);
      
      if (childUrls.length === 0) {
        console.warn(`⚠️ 未找到子 sitemap`);
        return [];
      }

      const allUrls = [];
      for (let i = 0; i < childUrls.length; i++) {
        const childUrl = childUrls[i];
        console.log(`🔄 处理子 sitemap ${i + 1}/${childUrls.length}: ${childUrl}`);
        
        try {
          const childURLs = await getAllContentURLs(childUrl, maxDepth - 1);
          console.log(`✅ 从 ${childUrl} 获取 ${childURLs.length} 个 URL`);
          allUrls.push(...childURLs);
          
          // 简短延迟
          if (i < childUrls.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error) {
          console.error(`❌ 子 sitemap 失败: ${childUrl}`, error.message);
        }
      }

      console.log(`🎉 递归完成，总计: ${allUrls.length} 个 URL`);
      return allUrls;
      
    } else {
      console.log(`📑 处理内容 sitemap`);
      
      // 直接提取所有 <loc> 标签，过滤掉 sitemap 文件
      const locMatches = xmlContent.match(/<loc>(.*?)<\/loc>/g) || [];
      const urls = locMatches.map(match => 
        match.replace(/<\/?loc>/g, '').trim()
      ).filter(url => !url.includes('sitemap') && url.startsWith('http'));
      
      console.log(`✅ 提取到 ${urls.length} 个内容 URL`);
      
      if (urls.length > 0) {
        console.log(`📝 前 3 个 URL: ${urls.slice(0, 3).join(', ')}`);
      }
      
      return urls;
    }

  } catch (error) {
    console.error(`❌ 处理失败: ${sitemapUrl}`, error.message);
    return [];
  }
} 