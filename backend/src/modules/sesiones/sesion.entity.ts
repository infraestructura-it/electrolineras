import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Cargador } from '../cargadores/cargador.entity';

@Entity('sesiones_carga')
export class SesionCarga {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Cargador)
  cargador: Cargador;

  @Column()
  usuario_id: string;

  @Column({ type: 'timestamptz' })
  inicio: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fin: Date | null;

  @Column({ type: 'decimal', precision: 10, scale: 3, default: 0 })
  kwh_consumidos: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  costo_total: number | null;

  @Column({ default: 'en_curso' })
  estado: 'en_curso' | 'finalizada' | 'fallida';
}
