import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { AlmacenService } from '../../comun/almacen.service';

// Cuenta de la app del conductor (usuario final que carga su vehículo). Es independiente de
// los usuarios del panel: tiene su propio token (tipo "conductor") y no ve nada del panel.
export interface ConductorRegistro {
  id: string;
  nombre: string;
  email: string;
  celular: string | null;
  sal: string;
  hash: string;
  creado: string;
}

export type ConductorPublico = Omit<ConductorRegistro, 'sal' | 'hash'>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Datos persistidos en data/conductores.json (ver AlmacenService).
@Injectable()
export class ConductoresService {
  private readonly conductores = new Map<string, ConductorRegistro>();

  constructor(private readonly almacen: AlmacenService) {
    for (const c of this.almacen.leer<ConductorRegistro[]>('conductores', [])) this.conductores.set(c.id, c);
  }

  registrar(data: { nombre?: string; email?: string; celular?: string; password?: string }): ConductorPublico {
    const nombre = data.nombre?.trim();
    const email = data.email?.trim().toLowerCase() ?? '';
    if (!nombre) throw new BadRequestException('Escribe tu nombre');
    if (!EMAIL.test(email)) throw new BadRequestException('Correo inválido');
    if (!data.password || data.password.length < 8) throw new BadRequestException('La clave debe tener al menos 8 caracteres');
    if (this.porEmail(email)) throw new ConflictException('Ya existe una cuenta con ese correo: inicia sesión');
    const sal = randomBytes(16).toString('hex');
    const conductor: ConductorRegistro = {
      id: randomUUID(),
      nombre,
      email,
      celular: data.celular?.trim() || null,
      sal,
      hash: scryptSync(data.password, sal, 64).toString('hex'),
      creado: new Date().toISOString(),
    };
    this.conductores.set(conductor.id, conductor);
    this.persistir();
    return this.publico(conductor);
  }

  validar(email: string, password: string): ConductorPublico {
    const conductor = this.porEmail(String(email ?? '').trim().toLowerCase());
    if (conductor && password) {
      const calculado = scryptSync(password, conductor.sal, 64);
      const guardado = Buffer.from(conductor.hash, 'hex');
      if (calculado.length === guardado.length && timingSafeEqual(calculado, guardado)) return this.publico(conductor);
    }
    throw new UnauthorizedException('Correo o clave incorrectos');
  }

  obtener(id: string): ConductorPublico {
    const c = this.conductores.get(id);
    if (!c) throw new NotFoundException('Cuenta no encontrada');
    return this.publico(c);
  }

  private porEmail(email: string) {
    return [...this.conductores.values()].find((c) => c.email === email);
  }

  private publico({ sal, hash, ...resto }: ConductorRegistro): ConductorPublico {
    return resto;
  }

  private persistir() {
    this.almacen.guardar('conductores', [...this.conductores.values()]);
  }
}
