// Cargador OCPP mínimo para las pruebas: se conecta al gateway, envía CALLs y responde
// los comandos del sistema central con lo que indique la prueba.
import WebSocket from 'ws';

type Payload = Record<string, unknown>;
type Respondedor = (accion: string, payload: Payload) => Payload | { error: string };

export class CargadorFalso {
  readonly recibidos: { accion: string; payload: Payload }[] = [];
  private secuencia = 0;
  private pendientes = new Map<string, { resolver: (v: any) => void; rechazar: (e: Error) => void }>();
  private esperas: { accion: string; resolver: (p: Payload) => void }[] = [];
  responder: Respondedor = () => ({ status: 'Accepted' });

  private constructor(readonly ws: WebSocket) {
    ws.on('message', (datos) => this.alRecibir(JSON.parse(datos.toString())));
  }

  // Resuelve con el cargador conectado, o rechaza con el código HTTP del handshake (404, 400…).
  static conectar(puerto: number, serie: string, protocolos: string[] = ['ocpp1.6']): Promise<CargadorFalso> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${puerto}/ocpp/${serie}`, protocolos);
      ws.once('open', () => resolve(new CargadorFalso(ws)));
      ws.once('unexpected-response', (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
      ws.once('error', reject);
    });
  }

  get protocolo() {
    return this.ws.protocol;
  }

  // CALL del cargador al sistema central. Resuelve con el payload del CALLRESULT.
  call(accion: string, payload: Payload): Promise<Payload> {
    const id = `t${++this.secuencia}`;
    return new Promise((resolver, rechazar) => {
      this.pendientes.set(id, { resolver, rechazar });
      this.ws.send(JSON.stringify([2, id, accion, payload]));
    });
  }

  // Espera a que el sistema central envíe un comando (RemoteStartTransaction, etc.).
  esperarComando(accion: string, ms = 5000): Promise<Payload> {
    const ya = this.recibidos.find((r) => r.accion === accion);
    if (ya) {
      this.recibidos.splice(this.recibidos.indexOf(ya), 1);
      return Promise.resolve(ya.payload);
    }
    return new Promise((resolver, rechazar) => {
      const t = setTimeout(() => rechazar(new Error(`No llegó ${accion}`)), ms);
      this.esperas.push({ accion, resolver: (p) => (clearTimeout(t), resolver(p)) });
    });
  }

  cerrar() {
    return new Promise<void>((r) => {
      if (this.ws.readyState === WebSocket.CLOSED) return r();
      this.ws.once('close', () => r());
      this.ws.close();
    });
  }

  private alRecibir(m: unknown[]) {
    const [tipo, id] = m as [number, string];
    if (tipo === 2) {
      const accion = m[2] as string;
      const payload = (m[3] ?? {}) as Payload;
      const espera = this.esperas.find((e) => e.accion === accion);
      if (espera) {
        this.esperas.splice(this.esperas.indexOf(espera), 1);
        espera.resolver(payload);
      } else {
        this.recibidos.push({ accion, payload });
      }
      const r = this.responder(accion, payload);
      this.ws.send(JSON.stringify('error' in r ? [4, id, r.error, 'Error de prueba', {}] : [3, id, r]));
      return;
    }
    const p = this.pendientes.get(id);
    if (!p) return;
    this.pendientes.delete(id);
    if (tipo === 3) p.resolver(m[2]);
    else p.rechazar(Object.assign(new Error(String(m[3])), { codigo: m[2] }));
  }
}

// Reintenta una condición asíncrona hasta que se cumpla (los mensajes OCPP no son instantáneos).
export async function esperarQue<T>(fn: () => Promise<T>, ok: (v: T) => boolean, ms = 3000): Promise<T> {
  const limite = Date.now() + ms;
  let ultimo = await fn();
  while (!ok(ultimo)) {
    if (Date.now() > limite) throw new Error(`Condición no cumplida. Último valor: ${JSON.stringify(ultimo)}`);
    await new Promise((r) => setTimeout(r, 25));
    ultimo = await fn();
  }
  return ultimo;
}
