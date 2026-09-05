import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { Operador } from '../operadores/operador.entity';

@Entity('cargadores')
export class Cargador {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Operador, (operador) => operador.cargadores)
  operador: Operador;

  @Column({ unique: true })
  numero_serie: string; // ej. MDX20260715001

  @Column()
  modelo: string; // ej. MDXDC3001

  @Column({ nullable: true })
  ubicacion: string;

  @Column({ default: 'inactivo' })
  estado: 'activo' | 'inactivo' | 'en_falla';

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  tarifa_por_kwh: number | null;
}
