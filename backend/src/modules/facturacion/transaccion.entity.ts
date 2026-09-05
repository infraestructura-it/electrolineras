import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { SesionCarga } from '../sesiones/sesion.entity';

@Entity('transacciones')
export class Transaccion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SesionCarga)
  sesion: SesionCarga;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  monto_total: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  comision_plataforma: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  monto_operador: number;

  @Column({ default: 'pendiente' })
  estado_pago: 'pendiente' | 'aprobado' | 'rechazado';

  @Column({ nullable: true })
  referencia_pasarela: string; // id de transacción en Wompi
}
