// Levanta la API completa (AppModule) igual que main.ts, pero con los datos en una carpeta
// temporal y en un puerto libre, para probar de punta a punta sin tocar backend/data.
import 'reflect-metadata';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

export const ADMIN_EMAIL = 'admin@pruebas.local';
export const ADMIN_PASSWORD = 'clave-de-pruebas-123';

export interface AppDePrueba {
  app: INestApplication;
  http: ReturnType<typeof request>;
  puerto: number;
  carpeta: string;
  token: string; // token del admin de la plataforma
  cerrar: () => Promise<void>;
}

export async function crearApp(): Promise<AppDePrueba> {
  const carpeta = mkdtempSync(join(tmpdir(), 'electrolineras-test-'));
  process.env.DATA_DIR = carpeta;
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
  process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  process.env.JWT_SECRET = 'secreto-de-pruebas';
  delete process.env.LICENCIA_CLAVE_PUBLICA; // licenciamiento desactivado en las pruebas

  // Import diferido: los módulos leen process.env al cargarse.
  const { AppModule } = await import('../../src/app.module');
  const { OcppGatewayService } = await import('../../src/modules/ocpp-gateway/ocpp-gateway.service');

  const modulo = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = modulo.createNestApplication({ logger: false });
  app.enableCors();
  app.get(OcppGatewayService).adjuntar(app.getHttpServer());
  await app.listen(0);
  const puerto = (app.getHttpServer().address() as { port: number }).port;
  const http = request(app.getHttpServer());

  const login = await http.post('/auth/login').send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  if (login.status !== 201 && login.status !== 200) throw new Error(`Login admin falló: ${login.status} ${JSON.stringify(login.body)}`);

  return {
    app,
    http,
    puerto,
    carpeta,
    token: login.body.token,
    cerrar: async () => {
      await app.close();
      rmSync(carpeta, { recursive: true, force: true });
    },
  };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
