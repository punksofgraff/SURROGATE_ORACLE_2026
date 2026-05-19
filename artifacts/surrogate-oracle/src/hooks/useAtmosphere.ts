import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  opacity: number;
  life: number;
  maxLife: number;
}

export function useAtmosphere(canvasRef: React.RefObject<HTMLCanvasElement | null>, isActive: boolean, alignment: 'sacred' | 'profane' | 'neutral' | null) {
  const particlesRef = useRef<Particle[]>([]);
  const animationFrameRef = useRef<number>(0);
  const targetIntensityRef = useRef(0);
  const currentIntensityRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize canvas to match display size
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Initialize particles
    if (particlesRef.current.length === 0) {
      for (let i = 0; i < 40; i++) {
        particlesRef.current.push(createParticle(canvas.width, canvas.height));
      }
    }

    const render = () => {
      // Smoothly transition intensity based on active state
      targetIntensityRef.current = isActive ? 1 : 0.2;
      currentIntensityRef.current += (targetIntensityRef.current - currentIntensityRef.current) * 0.05;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Determine color based on alignment
      let baseR = 0, baseG = 255, baseB = 136; // Default neon green
      if (alignment === 'sacred') {
        baseR = 234; baseG = 179; baseB = 8; // Yellow
      } else if (alignment === 'profane') {
        baseR = 176; baseG = 38; baseB = 255; // Purple
      }

      particlesRef.current.forEach((p, index) => {
        // Update position
        p.x += p.speedX * currentIntensityRef.current;
        p.y += p.speedY * currentIntensityRef.current;
        p.life--;

        // Fade in and out based on life
        let currentOpacity = p.opacity;
        if (p.maxLife - p.life < 30) {
           currentOpacity = p.opacity * ((p.maxLife - p.life) / 30);
        } else if (p.life < 30) {
           currentOpacity = p.opacity * (p.life / 30);
        }

        // Draw particle (soft glowing orb)
        const radgrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        radgrad.addColorStop(0, `rgba(${baseR}, ${baseG}, ${baseB}, ${currentOpacity * currentIntensityRef.current})`);
        radgrad.addColorStop(1, `rgba(${baseR}, ${baseG}, ${baseB}, 0)`);
        
        ctx.fillStyle = radgrad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Reset particle if dead or out of bounds
        if (p.life <= 0 || p.y < -50 || p.x < -50 || p.x > canvas.width + 50) {
          particlesRef.current[index] = createParticle(canvas.width, canvas.height, true);
        }
      });

      // Occasional scanline glitch
      if (isActive && Math.random() > 0.98) {
        ctx.fillStyle = `rgba(${baseR}, ${baseG}, ${baseB}, ${Math.random() * 0.05})`;
        ctx.fillRect(0, Math.random() * canvas.height, canvas.width, Math.random() * 4 + 1);
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [canvasRef, isActive, alignment]);
}

function createParticle(width: number, height: number, fromBottom = false): Particle {
  return {
    x: Math.random() * width,
    y: fromBottom ? height + 20 : Math.random() * height,
    size: Math.random() * 3 + 1,
    speedX: (Math.random() - 0.5) * 0.5,
    speedY: (Math.random() * -1.5) - 0.2,
    opacity: Math.random() * 0.4 + 0.1,
    life: Math.random() * 200 + 100,
    maxLife: 300
  };
}