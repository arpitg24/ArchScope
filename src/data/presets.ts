import { DesignPreset } from '@/types';

export const PRESETS: DesignPreset[] = [
  {
    id: 'demo',
    name: 'Demo',
    description: 'Demo architecture with rate limiter, message queue, and workers',
    simulationParams: {
      concurrentUsers: 100,
      requestsPerSecPerUser: 100,
      payloadSizeMB: 0.001,
      simulationDurationSeconds: 10,
      loadProfile: 'repeating_spike' as const,
      spikeFrequency: 2,
      spikeIntensity: 2,
    },
    nodes: [
      {
        id: 'client',
        type: 'infra',
        position: { x: 400, y: 300 },
        data: {
          label: 'Client',
          componentType: 'client',
          config: { serviceId: 'web_client' },
        },
      },
      {
        id: 'rl',
        type: 'infra',
        position: { x: 400, y: 450 },
        data: {
          label: 'Rate Limiter',
          componentType: 'rate_limiter',
          config: {
            serviceId: 'rate_limiter_redis',
            rateLimitAlgorithm: 'token_bucket',
            rateLimitBucketSize: 100,
            rateLimitRefillRate: 100,
          },
        },
      },
      {
        id: 'lb',
        type: 'infra',
        position: { x: 400, y: 600 },
        data: {
          label: 'Load Balancer',
          componentType: 'load_balancer',
          config: { serviceId: 'alb' },
        },
      },
      {
        id: 'api1',
        type: 'infra',
        position: { x: 250, y: 750 },
        data: {
          label: 'API Server 1',
          componentType: 'api_server',
          config: { serviceId: 'ec2_c5_xlarge' },
        },
      },
      {
        id: 'api2',
        type: 'infra',
        position: { x: 550, y: 750 },
        data: {
          label: 'API Server 2',
          componentType: 'api_server',
          config: { serviceId: 'ec2_c5_xlarge' },
        },
      },
      {
        id: 'cache1',
        type: 'infra',
        position: { x: 150, y: 900 },
        data: {
          label: 'Cache 1',
          componentType: 'cache',
          config: { serviceId: 'elasticache_redis', cacheHitRate: 0.8 },
        },
      },
      {
        id: 'db1',
        type: 'infra',
        position: { x: 300, y: 1000 },
        data: {
          label: 'Database 1',
          componentType: 'database',
          config: { serviceId: 'rds_postgres' },
        },
      },
      {
        id: 'cache2',
        type: 'infra',
        position: { x: 650, y: 900 },
        data: {
          label: 'Cache 2',
          componentType: 'cache',
          config: { serviceId: 'elasticache_redis', cacheHitRate: 0.8 },
        },
      },
      {
        id: 'db2',
        type: 'infra',
        position: { x: 500, y: 1000 },
        data: {
          label: 'Database 2',
          componentType: 'database',
          config: { serviceId: 'rds_postgres' },
        },
      },
      {
        id: 'mq',
        type: 'infra',
        position: { x: 700, y: 500 },
        data: {
          label: 'Message Queue',
          componentType: 'message_queue',
          config: { serviceId: 'sqs', queueMaxMessages: 10000, queueProcessingTimeMs: 100 },
        },
      },
      {
        id: 'worker1',
        type: 'infra',
        position: { x: 650, y: 650 },
        data: {
          label: 'Worker 1',
          componentType: 'worker',
          config: { serviceId: 'ec2_worker' },
        },
      },
      {
        id: 'worker2',
        type: 'infra',
        position: { x: 850, y: 650 },
        data: {
          label: 'Worker 2',
          componentType: 'worker',
          config: { serviceId: 'ec2_worker' },
        },
      },
    ],
    edges: [
      { id: 'e-client-rl', source: 'client', target: 'rl', sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-rl-lb', source: 'rl', target: 'lb', animated: true, sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-rl-mq', source: 'rl', target: 'mq', sourceHandle: 'right-source', targetHandle: 'left-target' },
      { id: 'e-lb-api1', source: 'lb', target: 'api1', animated: true, sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-lb-api2', source: 'lb', target: 'api2', animated: true, sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-api1-cache1', source: 'api1', target: 'cache1', sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-api1-db1', source: 'api1', target: 'db1', sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-api2-cache2', source: 'api2', target: 'cache2', sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-api2-db2', source: 'api2', target: 'db2', sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-mq-worker1', source: 'mq', target: 'worker1', animated: true, sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-mq-worker2', source: 'mq', target: 'worker2', animated: true, sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-worker1-api1', source: 'worker1', target: 'api1', sourceHandle: 'left-source', targetHandle: 'right-target' },
      { id: 'e-worker2-api2', source: 'worker2', target: 'api2', sourceHandle: 'bottom-source', targetHandle: 'right-target' },
    ],
  },
  {
    id: 'Url Shortener',
    name: 'URL Shortener',
    description: 'Shorten long URLs and redirect via short codes',
    simulationParams: {
      concurrentUsers: 1000,
      requestsPerSecPerUser: 1,
      payloadSizeMB: 0.001,
      simulationDurationSeconds: 10,
      loadProfile: 'repeating_spike' as const,
      spikeFrequency: 2,
      spikeIntensity: 2,
    },
    nodes: [
      {
        id: 'client',
        type: 'infra',
        position: { x: 400, y: 450 },
        data: {
          label: 'Client',
          componentType: 'client',
          config: { serviceId: 'web_client' },
        },
      },
      {
        id: 'lb',
        type: 'infra',
        position: { x: 400, y: 600 },
        data: {
          label: 'Load Balancer',
          componentType: 'load_balancer',
          config: { serviceId: 'alb' },
        },
      },
      {
        id: 'api1',
        type: 'infra',
        position: { x: 225, y: 750 },
        data: {
          label: 'API Server 1',
          componentType: 'api_server',
          config: { serviceId: 'ec2_c5_xlarge' },
        },
      },
      {
        id: 'api2',
        type: 'infra',
        position: { x: 400, y: 750 },
        data: {
          label: 'API Server 2',
          componentType: 'api_server',
          config: { serviceId: 'ec2_c5_xlarge' },
        },
      },
      {
        id: 'api3',
        type: 'infra',
        position: { x: 575, y: 750 },
        data: {
          label: 'API Server 3',
          componentType: 'api_server',
          config: { serviceId: 'ec2_c5_xlarge' },
        },
      },
      {
        id: 'cache1',
        type: 'infra',
        position: { x: 300, y: 900 },
        data: {
          label: 'URL Cache 1',
          componentType: 'cache',
          config: { serviceId: 'elasticache_redis', cacheHitRate: 0.85 },
        },
      },
      {
        id: 'cache2',
        type: 'infra',
        position: { x: 500, y: 900 },
        data: {
          label: 'URL Cache 2',
          componentType: 'cache',
          config: { serviceId: 'elasticache_redis', cacheHitRate: 0.85 },
        },
      },
      {
        id: 'db',
        type: 'infra',
        position: { x: 400, y: 1050 },
        data: {
          label: 'URL Database',
          componentType: 'database',
          config: { serviceId: 'dynamodb' },
        },
      },
    ],
    edges: [
      { id: 'e-client-lb', source: 'client', target: 'lb', sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-lb-api1', source: 'lb', target: 'api1', animated: true,  sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-lb-api2', source: 'lb', target: 'api2', animated: true, sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-lb-api3', source: 'lb', target: 'api3', animated: true, sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-api1-cache1', source: 'api1', target: 'cache1', sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-api2-cache1', source: 'api2', target: 'cache1', sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-api3-cache2', source: 'api3', target: 'cache2', sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-cache1-db', source: 'cache1', target: 'db', sourceHandle: 'bottom-source', targetHandle: 'top-target' },
      { id: 'e-cache2-db', source: 'cache2', target: 'db', sourceHandle: 'bottom-source', targetHandle: 'top-target' },
    ],
  }
];
