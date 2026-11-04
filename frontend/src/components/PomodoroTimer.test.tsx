import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import React from 'react'
import { PomodoroTimer } from './PomodoroTimer'

describe('PomodoroTimer Component Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear()
    }
  })

  it('debe requerir una tarea activa para iniciar y mostrar un cartel de advertencia', async () => {
    // Mock fetch to return empty tasks list
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ results: { bindings: [] }, success: true }),
    })
    global.fetch = mockFetch

    render(<PomodoroTimer showCloseButton={false} />)

    // Click "Iniciar"
    const startButton = screen.getByText('Iniciar')
    fireEvent.click(startButton)

    // Check if the warning banner is displayed
    const warning = await screen.findByText(/Debes seleccionar una tarea activa/i)
    expect(warning).toBeInTheDocument()
  })

  it('debe permitir iniciar el temporizador si hay una tarea seleccionada', async () => {
    const mockTask = {
      task: { value: 'http://cientopolis.org/rfu/task/1' },
      title: { value: 'Test Task' },
      description: { value: 'Test Description' },
      status: { value: 'pending' },
    }

    const mockFetch = vi.fn().mockImplementation(() => {
      // Return list of tasks
      return Promise.resolve({
        json: () => Promise.resolve({
          results: { bindings: [mockTask] },
          success: true
        })
      })
    })
    global.fetch = mockFetch

    render(<PomodoroTimer showCloseButton={false} />)

    // Wait for task dropdown to populate
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeInTheDocument()
    })

    // Select the task
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'http://cientopolis.org/rfu/task/1' } })

    // Click Iniciar
    const startButton = screen.getByText('Iniciar')
    fireEvent.click(startButton)

    // Check that warning does NOT appear
    expect(screen.queryByText(/Debes seleccionar una tarea activa/i)).not.toBeInTheDocument()
  })

  it('debe establecer el título de la pestaña del navegador en DireAtento y no Pomodoro Timer', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ results: { bindings: [] }, success: true }),
    })
    global.fetch = mockFetch

    render(<PomodoroTimer showCloseButton={false} />)

    await waitFor(() => {
      expect(document.title).toBe('DireAtento')
      expect(document.title).not.toContain('Pomodoro Timer')
    })
  })

  it('debe permitir seleccionar y probar los sonidos de tictac mecánicos de reloj y timer de cocina', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ results: { bindings: [] }, success: true }),
    })
    global.fetch = mockFetch

    render(<PomodoroTimer showCloseButton={false} />)

    // Abrir la sección colapsable de opciones de sonido (UX & ALERTAS)
    const uxOptionsHeader = screen.getByText(/UX & ALERTAS/i)
    fireEvent.click(uxOptionsHeader)

    // Verificar que figure el selector de tictac con el Reloj de Cocina (Audio Real) activo por defecto
    const tickSelect = screen.getByDisplayValue(/Reloj de Cocina \(Audio Real\)/i)
    expect(tickSelect).toBeInTheDocument()

    // Cambiar a Timer de Cocina (Mecánico), Reloj de Cuerda y Reloj de Péndulo
    fireEvent.change(tickSelect, { target: { value: 'kitchen' } })
    expect(screen.getByDisplayValue(/Timer de Cocina \(Mecánico\)/i)).toBeInTheDocument()

    fireEvent.change(tickSelect, { target: { value: 'classic' } })
    expect(screen.getByDisplayValue(/Reloj de Cuerda/i)).toBeInTheDocument()

    fireEvent.change(tickSelect, { target: { value: 'pendulum' } })
    expect(screen.getByDisplayValue(/Reloj de Péndulo/i)).toBeInTheDocument()

    // Volver a Reloj de Cocina (Audio Real) y probar el botón "🔊 Probar"
    fireEvent.change(tickSelect, { target: { value: 'kitchen-audio' } })
    expect(screen.getByDisplayValue(/Reloj de Cocina \(Audio Real\)/i)).toBeInTheDocument()

    const testButtons = screen.getAllByRole('button', { name: /🔊 Probar/i })
    expect(testButtons.length).toBeGreaterThanOrEqual(1)
    fireEvent.click(testButtons[0])
  })
})
