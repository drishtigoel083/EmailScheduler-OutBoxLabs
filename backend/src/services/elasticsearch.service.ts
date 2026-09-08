import { Client } from '@elastic/elasticsearch';
import { config } from '../config/index.js';

export const esClient = new Client({
  node: config.elasticsearch.node,
});

export const ES_INDEX_NAME = 'emails_index';

/**
 * Initialize Elasticsearch index with explicit mappings
 */
export async function initElasticsearchIndex(): Promise<void> {
  try {
    const exists = await esClient.indices.exists({ index: ES_INDEX_NAME });
    if (!exists) {
      await esClient.indices.create({
        index: ES_INDEX_NAME,
        mappings: {
          properties: {
            id: { type: 'keyword' },
            userId: { type: 'keyword' },
            sender: { type: 'keyword' },
            recipient: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            subject: { type: 'text' },
            body: { type: 'text' },
            status: { type: 'keyword' },
            scheduledAt: { type: 'date' },
            sentAt: { type: 'date' },
            createdAt: { type: 'date' },
          },
        },
      });
      console.log(`✅ Elasticsearch index '${ES_INDEX_NAME}' created successfully.`);
    }
  } catch (error: any) {
    console.error('⚠️ Elasticsearch index init error (continuing without ES):', error?.message || error);
  }
}

/**
 * Index or update an email document in Elasticsearch
 */
export async function indexEmailDocument(email: any): Promise<void> {
  try {
    await esClient.index({
      index: ES_INDEX_NAME,
      id: email.id,
      document: {
        id: email.id,
        userId: email.userId,
        sender: email.sender,
        recipient: email.recipient,
        subject: email.subject,
        body: email.body,
        status: email.status,
        scheduledAt: email.scheduledAt,
        sentAt: email.sentAt,
        createdAt: email.createdAt,
      },
      refresh: 'wait_for',
    });
  } catch (error: any) {
    console.error(`⚠️ Elasticsearch failed to index email ${email.id}:`, error?.message || error);
  }
}

/**
 * Search emails by text query across subject, recipient, body, or status
 */
export async function searchEmailsInES(searchQuery: string, statusFilter?: string) {
  try {
    const mustQueries: any[] = [];

    if (searchQuery && searchQuery.trim() !== '') {
      mustQueries.push({
        multi_match: {
          query: searchQuery,
          fields: ['subject^3', 'recipient^2', 'body'],
          fuzziness: 'AUTO',
        },
      });
    } else {
      mustQueries.push({ match_all: {} });
    }

    if (statusFilter) {
      mustQueries.push({
        term: { status: statusFilter },
      });
    }

    const response = await esClient.search({
      index: ES_INDEX_NAME,
      query: {
        bool: {
          must: mustQueries,
        },
      },
    });

    const hits = response.hits.hits.map((hit: any) => hit._source);
    return {
      total: response.hits.total ? (typeof response.hits.total === 'number' ? response.hits.total : response.hits.total.value) : hits.length,
      data: hits,
    };
  } catch (error: any) {
    console.error('⚠️ Elasticsearch search error:', error?.message || error);
    // Return empty fallback array on ES failure
    return { total: 0, data: [], error: error?.message };
  }
}
