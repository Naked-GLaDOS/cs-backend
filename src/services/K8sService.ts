import * as k8s from '@kubernetes/client-node';

export class K8sService {
  private k8sApi: k8s.CoreV1Api;
  private appsApi: k8s.AppsV1Api;
  private namespace: string;

  constructor() {
    const kc = new k8s.KubeConfig();
    kc.loadFromCluster();
    this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    this.appsApi = kc.makeApiClient(k8s.AppsV1Api);
    this.namespace = process.env.NAMESPACE || 'apps';
  }

  async getPodStatus(): Promise<{ running: boolean; restartCount: number; phase: string; startTime?: string }> {
    try {
      const pods = await this.k8sApi.listNamespacedPod(
        this.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        'app=cs2-server'
      );

      if (pods.body.items.length === 0) {
        return { running: false, restartCount: 0, phase: 'NotFound' };
      }

      const pod = pods.body.items[0];
      const containerStatus = pod.status?.containerStatuses?.[0];

      return {
        running: pod.status?.phase === 'Running',
        restartCount: containerStatus?.restartCount || 0,
        phase: pod.status?.phase || 'Unknown',
        startTime: pod.status?.startTime?.toISOString(),
      };
    } catch (error) {
      console.error('[K8s] Failed to get pod status:', error);
      return { running: false, restartCount: 0, phase: 'Error' };
    }
  }

  async getPodLogs(tailLines: number = 500): Promise<string> {
    try {
      const pods = await this.k8sApi.listNamespacedPod(
        this.namespace,
        undefined,
        undefined,
        undefined,
        undefined,
        'app=cs2-server'
      );

      if (pods.body.items.length === 0) {
        return 'No CS2 server pod found';
      }

      const podName = pods.body.items[0].metadata?.name || '';
      const logResponse = await this.k8sApi.readNamespacedPodLog(
        podName,
        this.namespace,
        'cs2-server',
        undefined,
        undefined,
        undefined,
        false,
        tailLines,
        undefined,
        false
      );

      return logResponse.body || '';
    } catch (error) {
      console.error('[K8s] Failed to get logs:', error);
      return 'Failed to retrieve logs';
    }
  }

  async restartServer(): Promise<{ success: boolean; message: string }> {
    try {
      const { body: deployment } = await this.appsApi.readNamespacedDeployment('cs2-server', this.namespace);

      if (!deployment.metadata) {
        deployment.metadata = {};
      }
      if (!deployment.metadata.annotations) {
        deployment.metadata.annotations = {};
      }

      deployment.metadata.annotations['kubectl.kubernetes.io/restartedAt'] = new Date().toISOString();

      await this.appsApi.replaceNamespacedDeployment(
        'cs2-server',
        this.namespace,
        deployment
      );

      return { success: true, message: 'CS2 server restarting...' };
    } catch (error) {
      console.error('[K8s] Failed to restart:', error);
      return { success: false, message: 'Failed to restart server' };
    }
  }

  async stopServer(): Promise<{ success: boolean; message: string }> {
    try {
      await this.appsApi.patchNamespacedDeploymentScale(
        'cs2-server',
        this.namespace,
        { spec: { replicas: 0 } }
      );
      return { success: true, message: 'CS2 server stopping...' };
    } catch (error) {
      console.error('[K8s] Failed to stop:', error);
      return { success: false, message: 'Failed to stop server' };
    }
  }

  async startServer(): Promise<{ success: boolean; message: string }> {
    try {
      await this.appsApi.patchNamespacedDeploymentScale(
        'cs2-server',
        this.namespace,
        { spec: { replicas: 1 } }
      );
      return { success: true, message: 'CS2 server starting...' };
    } catch (error) {
      console.error('[K8s] Failed to start:', error);
      return { success: false, message: 'Failed to start server' };
    }
  }

  async updateEnvVars(envVars: Record<string, string>): Promise<{ success: boolean; message: string }> {
    try {
      const { body: deployment } = await this.appsApi.readNamespacedDeployment('cs2-server', this.namespace);

      if (!deployment.spec?.template?.spec?.containers?.[0]?.env) {
        return { success: false, message: 'No containers found' };
      }

      const container = deployment.spec.template.spec.containers[0];
      const existingEnv = container.env || [];

      for (const [key, value] of Object.entries(envVars)) {
        const existingIndex = existingEnv.findIndex((e: { name: string }) => e.name === key);
        if (existingIndex >= 0) {
          existingEnv[existingIndex].value = value;
        } else {
          existingEnv.push({ name: key, value });
        }
      }

      container.env = existingEnv;

      await this.appsApi.replaceNamespacedDeployment(
        'cs2-server',
        this.namespace,
        deployment
      );

      return { success: true, message: 'Environment variables updated, server restarting...' };
    } catch (error) {
      console.error('[K8s] Failed to update env vars:', error);
      return { success: false, message: 'Failed to update settings' };
    }
  }
}

export const k8sService = new K8sService();
