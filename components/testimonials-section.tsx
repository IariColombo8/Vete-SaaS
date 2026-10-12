"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Star, Quote, Heart } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useState } from "react"

const testimonials = [
  {
    name: "María González",
    image: "/smiling-woman-portrait.png",
    text: "Muy buena atención a domicilio. Rocky se pone nervioso en las veterinarias, pero en casa estuvo tranquilo durante toda la revisión.",
    rating: 5,
    pet: "Peter Pan - Schnauzer",
    color: "from-pink-500/10 to-rose-500/10",
    accentColor: "text-pink-600",
    borderColor: "group-hover:border-pink-500/50"
  },
  {
    name: "Carlos Rodríguez",
    image: "/smiling-man-portrait.png",
    text: "Me atendió super rápido cuando Toby tenía problemas en la patita. Además me vendió un collar antipulgas que le viene bárbaro.",
    rating: 5,
    pet: "Toby - Salchicha",
    color: "from-blue-500/10 to-cyan-500/10",
    accentColor: "text-blue-600",
    borderColor: "group-hover:border-blue-500/50"
  },
  {
    name: "Ana Martínez",
    image: "/woman-glasses-portrait.png",
    text: "Me encanta que venga a casa porque con el gatito es un tema llevarlo al veterinario. Siempre responde mis dudas con paciencia.",
    rating: 5,
    pet: "Milo - Gatito",
    color: "from-purple-500/10 to-indigo-500/10",
    accentColor: "text-purple-600",
    borderColor: "group-hover:border-purple-500/50"
  },
]

export function TestimonialsSection() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  return (
    <section className="relative py-16 md:py-20 lg:py-28 overflow-hidden bg-gradient-to-b from-muted/20 via-muted/40 to-muted/20">
      {/* Decorative background */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/3 rounded-full blur-3xl" />
      </div>

      <div className="container px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12 text-center md:mb-16 lg:mb-20 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="inline-block">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 mb-4 text-sm font-semibold rounded-full bg-primary/10 text-primary border border-primary/20">
              <Heart className="h-4 w-4 fill-current animate-pulse" />
              Testimonios
            </span>
          </div>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
            Lo que Dicen Nuestros Clientes
          </h2>
          <p className="mx-auto max-w-2xl text-base sm:text-lg md:text-xl text-muted-foreground leading-relaxed">
            La satisfacción de nuestros clientes y sus mascotas es nuestra mayor recompensa
          </p>
        </div>

        {/* Testimonials Grid - 2 columnas en móvil, 3 en desktop */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 md:gap-6 lg:grid-cols-3 lg:gap-8">
          {testimonials.map((testimonial, index) => (
            <div
              key={index}
              className="animate-in fade-in slide-in-from-bottom-8 duration-700"
              style={{ animationDelay: `${index * 150}ms` }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <Card className={`group relative h-full border-2 transition-all duration-500 hover:scale-105 hover:shadow-2xl hover:-translate-y-2 ${testimonial.borderColor} backdrop-blur-sm bg-background/95`}>
                {/* Gradient background on hover */}
                <div className={`absolute inset-0 bg-gradient-to-br ${testimonial.color} opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-lg`} />
                
                {/* Decorative quote icon */}
                <div className="absolute -top-2 -left-2 z-10 sm:-top-3 sm:-left-3 md:-top-4 md:-left-4">
                  <div className={`relative p-1.5 rounded-full bg-gradient-to-br ${testimonial.color} shadow-lg ring-2 ring-background transition-all duration-500 group-hover:scale-110 group-hover:rotate-12 sm:p-2 sm:ring-3 md:p-3 md:ring-4`}>
                    <Quote className={`h-3 w-3 ${testimonial.accentColor} fill-current sm:h-4 sm:w-4 md:h-6 md:w-6`} />
                  </div>
                </div>

                <CardContent className="relative p-3 space-y-2 sm:p-4 sm:space-y-3 md:p-6 md:space-y-4 lg:p-8 lg:space-y-5">
                  {/* Stars with animation */}
                  <div className="flex gap-0.5 sm:gap-1">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star
                        key={i}
                        className={`h-2.5 w-2.5 fill-yellow-400 text-yellow-400 transition-all duration-300 sm:h-3 sm:w-3 md:h-4 md:w-4 lg:h-5 lg:w-5 ${
                          hoveredIndex === index ? 'scale-110 rotate-12' : ''
                        }`}
                        style={{ 
                          transitionDelay: hoveredIndex === index ? `${i * 50}ms` : '0ms' 
                        }}
                      />
                    ))}
                  </div>

                  {/* Testimonial text */}
                  <blockquote className="relative">
                    <p className="text-[10px] leading-relaxed text-foreground/90 transition-colors duration-300 group-hover:text-foreground italic line-clamp-4 sm:text-xs sm:line-clamp-5 md:text-sm md:line-clamp-none lg:text-base">
                      “{testimonial.text}”
                    </p>
                  </blockquote>

                  {/* Divider line */}
                  <div className="relative py-1 sm:py-1.5 md:py-2">
                    <div className={`h-[1px] w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent transition-all duration-500 sm:h-[1.5px] md:h-[2px] ${
                      hoveredIndex === index ? 'via-primary/60' : ''
                    }`} />
                  </div>

                  {/* Author info */}
                  <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
                    <div className="relative">
                      <Avatar className="h-8 w-8 ring-2 ring-primary/20 transition-all duration-500 group-hover:ring-4 group-hover:ring-primary/40 group-hover:scale-110 sm:h-10 sm:w-10 md:h-12 md:w-12 lg:h-14 lg:w-14">
                        <AvatarImage 
                          src={testimonial.image || "/placeholder.svg"} 
                          alt={testimonial.name}
                          className="object-cover"
                        />
                        <AvatarFallback className="text-xs font-bold bg-gradient-to-br from-primary/20 to-primary/10 sm:text-sm md:text-base lg:text-lg">
                          {testimonial.name.charAt(0)}
                        </AvatarFallback>
                      </Avatar>
                      {/* Online indicator */}
                      <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 ring-1 ring-background animate-pulse sm:h-2.5 sm:w-2.5 sm:ring-2 md:h-3 md:w-3 lg:h-4 lg:w-4" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-[10px] truncate transition-colors duration-300 group-hover:text-primary sm:text-xs md:text-sm lg:text-base">
                        {testimonial.name}
                      </p>
                      <p className="text-[9px] text-muted-foreground font-medium truncate sm:text-[10px] md:text-xs">
                        {testimonial.pet}
                      </p>
                    </div>
                  </div>

                  {/* Progress dots */}
                  <div className="flex justify-center gap-1 pt-1 sm:gap-1.5 sm:pt-1.5 md:pt-2">
                    <div className={`h-1 w-1 rounded-full bg-primary/40 transition-all duration-300 sm:h-1.5 sm:w-1.5 ${hoveredIndex === index ? 'w-4 bg-primary sm:w-8' : ''}`} />
                    <div className="h-1 w-1 rounded-full bg-primary/40 sm:h-1.5 sm:w-1.5" />
                    <div className="h-1 w-1 rounded-full bg-primary/40 sm:h-1.5 sm:w-1.5" />
                  </div>
                </CardContent>

                {/* Shine effect */}
                <div className="absolute inset-0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none overflow-hidden">
                  <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12" />
                </div>
              </Card>
            </div>
          ))}
        </div>

        {/* Decorative line */}
        <div className="mt-12 flex justify-center animate-in fade-in duration-1000" style={{ animationDelay: '1000ms' }}>
          <div className="h-1 w-24 rounded-full bg-gradient-to-r from-primary/0 via-primary to-primary/0" />
        </div>
      </div>
    </section>
  )
}