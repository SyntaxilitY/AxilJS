import { describe, it, expect } from 'vitest';
import { generateDeployment } from '../src/deployment';

describe('Deployment Manifest Generator', () => {
  const config = {
    appName: 'payment-service',
    version: '1.4.2',
    port: 8080,
    replicas: 4,
    domain: 'payments.axiljs.io',
    env: {
      DATABASE_URL: 'postgresql://neondb_owner:npg_Cht0cBTzoDi2@ep-spring-silence-azxw55ks-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
      NODE_ENV: 'production',
    },
  };

  it('generates production manifests in dry-run mode without disk side-effects', () => {
    const manifests = generateDeployment(config, true);
    expect(manifests).toHaveLength(3);

    const [dockerfile, compose, k8s] = manifests;

    // Dockerfile assertions
    expect(dockerfile.filename).toBe('Dockerfile');
    expect(dockerfile.content).toContain('FROM node:22-alpine AS builder');
    expect(dockerfile.content).toContain('USER appuser');
    expect(dockerfile.content).toContain('EXPOSE 8080');

    // Docker Compose assertions
    expect(compose.filename).toBe('docker-compose.yml');
    expect(compose.content).toContain('8080:8080');
    expect(compose.content).toContain('DATABASE_URL=');

    // Kubernetes manifest assertions
    expect(k8s.filename).toBe('kubernetes.yaml');
    expect(k8s.content).toContain('kind: Deployment');
    expect(k8s.content).toContain('replicas: 4');
    expect(k8s.content).toContain('kind: HorizontalPodAutoscaler');
    expect(k8s.content).toContain('kind: PodDisruptionBudget');
    expect(k8s.content).toContain('kind: Ingress');
    expect(k8s.content).toContain('host: payments.axiljs.io');
    expect(k8s.content).toContain('readinessProbe:');
    expect(k8s.content).toContain('livenessProbe:');
  });

  it('sanitizes RFC 1123 application names for Kubernetes', () => {
    const invalidNameConfig = {
      appName: 'My_Special_App.v2!',
      version: '1.0.0',
      port: 3000,
    };

    const manifests = generateDeployment(invalidNameConfig, true);
    const k8s = manifests.find((m) => m.filename === 'kubernetes.yaml')!;

    expect(k8s.content).toContain('name: my-special-app-v2');
    expect(k8s.content).not.toContain('My_Special_App.v2!');
  });
});