import { useRef, useEffect, useCallback } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { setDefaultPose } from './Animations/defaultPose'
import * as AlphabetGestures from './Animations'

/**
 * MUDRA 3D Avatar Renderer Hook
 * Manages Three.js WebGL scene, Mixamo skeletal bone interpolation, and ISL animations.
 * 
 * Features:
 * - Completely removes SIH / external hackathon branding decal (Mesh/Material 'Asset 1')
 * - Supports verified whole-word gestures and fallback fingerspelling
 * - Clean ResizeObserver and unified continuous render loop
 * - Safe idempotent lifecycle
 */
export function useAvatarRenderer({
  containerRef,
  modelPath = '/ybot.glb',
  animationSpeed = 1.2,
  pauseDuration = 350,
  onTextUpdate,
  onLoadingChange,
  onError
}) {
  const boneTransitionsRef = useRef(new Map())

  const contextRef = useRef({
    animations: [],
    avatar: null,
    pending: false,
    animate: () => {},
    scene: null,
    camera: null,
    renderer: null,
    flag: false,
    boneNameMap: {}
  })

  const speedRef = useRef(animationSpeed)
  const pauseRef = useRef(pauseDuration)
  const onTextUpdateRef = useRef(onTextUpdate)
  const onLoadingChangeRef = useRef(onLoadingChange)
  const onErrorRef = useRef(onError)
  const isMountedRef = useRef(true)

  useEffect(() => {
    speedRef.current = animationSpeed
  }, [animationSpeed])

  useEffect(() => {
    pauseRef.current = pauseDuration
  }, [pauseDuration])

  useEffect(() => {
    onTextUpdateRef.current = onTextUpdate
  }, [onTextUpdate])

  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange
  }, [onLoadingChange])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  // Easing function for smooth organic motion
  const easeInOutCubic = (t) => {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
  }

  const addHumanVariation = (value, intensity = 0.02) => {
    return value * (1 + (Math.random() - 0.5) * intensity)
  }

  // Setup and run Three.js scene
  useEffect(() => {
    isMountedRef.current = true
    const hostElement = containerRef.current
    if (!hostElement) return
    // This run's own lifetime. React may mount twice in development: a model loaded by a discarded run must
    // not become ctx.avatar (animations would then move an avatar that is never drawn: frozen T-pose).
    let disposed = false

    const ctx = contextRef.current
    ctx.flag = false
    ctx.pending = false
    ctx.animations = []
    ctx.animate = () => {
      ctx.pending = true
    }

    // 1. Create Three.js Scene
    const scene = new THREE.Scene()
    scene.background = null
    ctx.scene = scene

    // 2. High-Quality 5-Point Lighting Rig
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.4)
    scene.add(ambientLight)

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6)
    keyLight.position.set(0, 2.5, 3.5)
    scene.add(keyLight)

    const fillLight = new THREE.DirectionalLight(0xe8e3f5, 1.0)
    fillLight.position.set(-3, 3, 3)
    scene.add(fillLight)

    const rimLight = new THREE.DirectionalLight(0xfdba74, 0.8)
    rimLight.position.set(3, 3, -2)
    scene.add(rimLight)

    const bounceLight = new THREE.DirectionalLight(0xfdfbf7, 0.6)
    bounceLight.position.set(0, -2, 2)
    scene.add(bounceLight)

    // 3. Camera Setup: Upper Torso, Chest, Hands & Face Framing
    const initialWidth = hostElement.clientWidth || 400
    const initialHeight = hostElement.clientHeight || 450

    const camera = new THREE.PerspectiveCamera(
      38,
      initialWidth / Math.max(initialHeight, 1),
      0.1,
      1000
    )
    camera.position.set(0, 1.38, 1.45)
    camera.lookAt(0, 1.28, 0)
    ctx.camera = camera

    // Fit the camera to the loaded model: head (with margin) down to the waist, plus the signing space
    // beside the body, for any container shape. Re-run on resize.
    const frameAvatar = () => {
      const f = ctx.framing
      if (!f) return
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
      const aspect = camera.aspect || 1
      const distV = (f.height / 2) / tanHalf
      const distH = f.halfWidth / (tanHalf * aspect)
      const dist = Math.max(distV, distH)
      camera.position.set(0, f.centerY, f.centerZ + dist)
      camera.lookAt(0, f.centerY, f.centerZ)
      camera.updateProjectionMatrix()
    }

    // 4. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    })
    renderer.setSize(initialWidth, initialHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = false
    renderer.outputColorSpace = THREE.SRGBColorSpace
    ctx.renderer = renderer

    if (!hostElement.contains(renderer.domElement)) {
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      renderer.domElement.style.display = 'block'
      hostElement.appendChild(renderer.domElement)
    }

    // 5. Responsive Resize Observer
    const resizeObserver = new ResizeObserver((entries) => {
      if (!isMountedRef.current || !ctx.camera || !ctx.renderer) return
      for (const entry of entries) {
        const width = entry.contentRect.width || hostElement.clientWidth
        const height = entry.contentRect.height || hostElement.clientHeight
        if (width > 0 && height > 0) {
          ctx.camera.aspect = width / height
          ctx.camera.updateProjectionMatrix()
          ctx.renderer.setSize(width, height)
          frameAvatar()
        }
      }
    })
    resizeObserver.observe(hostElement)

    // 6. Bone Finder Helper
    const findBoneByName = (root, name) => {
      if (!root) return null
      let bone = root.getObjectByName(name)
      if (bone) return bone

      const map = ctx.boneNameMap
      if (map && map[name]) {
        bone = root.getObjectByName(map[name])
        if (bone) return bone
      }

      if (name.startsWith('mixamorig') && !name.includes(':')) {
        const colonName = `mixamorig:${name.substring('mixamorig'.length)}`
        bone = root.getObjectByName(colonName)
        if (bone) return bone
      }

      const suffix = name.replace(/^.*mixamorig:?/, '')
      let found = null
      root.traverse((obj) => {
        if (obj?.name === suffix || obj?.name?.endsWith?.(suffix)) {
          found = obj
        }
      })
      return found
    }

    // 7. Load 3D Model & Strip SIH Branding
    const loader = new GLTFLoader()
    onLoadingChangeRef.current?.(true)

    loader.load(
      modelPath,
      (gltf) => {
        if (disposed || !isMountedRef.current) return

        try {
          // Process meshes and REMOVE SIH BRANDING
          gltf.scene.traverse((child) => {
            // Remove SIH decal mesh/texture
            if (
              child.name === 'Asset 1' ||
              child.material?.name === 'Asset 1' ||
              child.name?.toLowerCase().includes('asset')
            ) {
              child.visible = false
              child.renderOrder = -1
              if (child.parent) {
                child.parent.remove(child)
              }
              return
            }

            if (child.type === 'SkinnedMesh' || child.isMesh) {
              const mesh = child
              mesh.frustumCulled = false
              if (mesh.material) {
                const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
                materials.forEach((mat) => {
                  mat.roughness = 0.6
                  mat.metalness = 0.05
                  mat.needsUpdate = true
                })
              }
            }
          })

          ctx.avatar = gltf.scene
          scene.add(ctx.avatar)

          // Framing from the model's real size (T-pose bounding box and hip height)
          ctx.avatar.updateMatrixWorld(true)
          const box = new THREE.Box3().setFromObject(ctx.avatar)
          const size = box.getSize(new THREE.Vector3())
          const hips = ctx.avatar.getObjectByName('mixamorig:Hips') || ctx.avatar.getObjectByName('mixamorigHips')
          const hipsY = hips ? hips.getWorldPosition(new THREE.Vector3()).y : box.min.y + size.y * 0.53
          const top = box.max.y + size.y * 0.03
          const bottom = hipsY - size.y * 0.12 // resting hands sit around the hips
          ctx.framing = {
            centerY: (top + bottom) / 2,
            centerZ: (box.min.z + box.max.z) / 2,
            height: top - bottom,
            halfWidth: size.y * 0.3 // hands reach about this far to the side while signing
          }
          frameAvatar()

          // Build bone name lookup table
          const boneMap = {}
          ctx.avatar.traverse((obj) => {
            if (!obj.name) return
            boneMap[obj.name] = obj.name
            if (obj.name.startsWith('mixamorig:')) {
              const keyNoColon = obj.name.replace('mixamorig:', 'mixamorig')
              boneMap[keyNoColon] = obj.name
              const suffix = obj.name.replace(/^.*?:/, '')
              boneMap[suffix] = obj.name
            }
          })
          ctx.boneNameMap = boneMap

          // Set neutral starting posture
          setDefaultPose(ctx)
        } catch (initErr) {
          console.warn('3D Avatar: Warning during pose initialization:', initErr)
        } finally {
          if (isMountedRef.current) {
            onLoadingChangeRef.current?.(false)
          }
        }
      },
      undefined,
      (err) => {
        if (disposed) return
        console.error('3D Avatar: Failed to load model from:', modelPath, err)
        if (isMountedRef.current) {
          onLoadingChangeRef.current?.(false)
          onErrorRef.current?.(err)
        }
      }
    )

    // 8. Continuous Unified Render & Animation Loop
    let animLoopId = null
    const unifiedRenderLoop = () => {
      if (disposed || !isMountedRef.current) return
      animLoopId = requestAnimationFrame(unifiedRenderLoop)

      if (ctx.avatar && ctx.animations.length > 0 && !ctx.flag) {
        const currentFrame = ctx.animations[0]

        if (Array.isArray(currentFrame) && currentFrame.length > 0) {
          if (currentFrame[0] === 'add-text') {
            if (onTextUpdateRef.current && typeof currentFrame[1] === 'string') {
              onTextUpdateRef.current(currentFrame[1])
            }
            ctx.animations.shift()
          } else {
            const currentTime = performance.now()
            const transitions = boneTransitionsRef.current

            for (let i = 0; i < currentFrame.length; ) {
              const instruction = currentFrame[i]
              const [boneName, action, axis, targetValue] = instruction

              const bone = findBoneByName(ctx.avatar, boneName)

              if (!bone) {
                currentFrame.splice(i, 1)
                continue
              }

              const transitionKey = `${boneName}_${action}_${axis}`

              if (!transitions.has(transitionKey)) {
                const currentValue = bone[action][axis]
                const baseDuration = 300
                const calculatedDuration = Math.max(
                  180,
                  Math.min(750, baseDuration * (1 / speedRef.current))
                )
                const duration = addHumanVariation(calculatedDuration, 0.05)

                transitions.set(transitionKey, {
                  startValue: currentValue,
                  targetValue,
                  startTime: currentTime,
                  duration
                })
              }

              const transition = transitions.get(transitionKey)
              const elapsed = currentTime - transition.startTime
              const progress = Math.min(elapsed / transition.duration, 1)
              const easedProgress = easeInOutCubic(progress)

              const range = transition.targetValue - transition.startValue
              const newValue = transition.startValue + range * easedProgress

              bone[action][axis] = newValue

              if (progress >= 1) {
                bone[action][axis] = targetValue
                transitions.delete(transitionKey)
                currentFrame.splice(i, 1)
              } else {
                i++
              }
            }
          }
        } else {
          ctx.flag = true
          setTimeout(() => {
            if (isMountedRef.current) {
              ctx.flag = false
            }
          }, pauseRef.current)
          ctx.animations.shift()
        }
      }

      if (renderer && scene && camera) {
        renderer.render(scene, camera)
      }
    }

    unifiedRenderLoop()

    // 9. Cleanup
    return () => {
      disposed = true
      isMountedRef.current = false
      resizeObserver.disconnect()

      if (animLoopId) {
        cancelAnimationFrame(animLoopId)
        animLoopId = null
      }

      ctx.pending = false

      if (scene) {
        scene.traverse((object) => {
          if (object.isMesh) {
            object.geometry?.dispose()
            const materials = Array.isArray(object.material) ? object.material : [object.material]
            materials.forEach((m) => m?.dispose?.())
          }
        })
      }

      if (renderer && renderer.domElement) {
        if (renderer.domElement.parentNode === hostElement) {
          hostElement.removeChild(renderer.domElement)
        }
        renderer.dispose()
      }

      ctx.scene = null
      ctx.camera = null
      ctx.renderer = null
      ctx.avatar = null
      ctx.framing = null
      ctx.animations = []
      boneTransitionsRef.current.clear()
    }
  }, [containerRef, modelPath])

  /**
   * Triggers ISL gesture sequence for a word, phrase, or sentence
   */
  const executeSignSequence = useCallback((inputText) => {
    const ctx = contextRef.current
    if (!ctx.avatar || !isMountedRef.current) return

    ctx.animations = []
    boneTransitionsRef.current.clear()

    const tokens = inputText.match(/([a-zA-Z]+|[^a-zA-Z]+)/g) || []

    const wordAliasMap = {
      thank: 'ThankYou',
      thanks: 'ThankYou',
      thankyou: 'ThankYou',
      'thank you': 'ThankYou',
      namaste: 'Namaste',
      hello: 'Hello',
      goodbye: 'Goodbye',
      bye: 'Goodbye',
      yes: 'Yes',
      no: 'No',
      home: 'Home',
      person: 'Person',
      time: 'Time',
      you: 'You',
      water: 'Water',
      pani: 'Water',
      help: 'Help',
      madad: 'Help',
      peace: 'Peace',
      shanti: 'Peace',
      victory: 'Peace'
    }

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      const isWord = /^[a-zA-Z]+$/.test(token)

      if (isWord) {
        const lowerToken = token.toLowerCase()
        const titleCaseWord =
          wordAliasMap[lowerToken] ||
          token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()
        
        const wordFunctionName = `createWord${titleCaseWord}`
        const wordAnimation = AlphabetGestures[wordFunctionName]

        // Check 2-word combinations
        if (
          !wordAnimation &&
          i + 2 < tokens.length &&
          /^[^a-zA-Z]+$/.test(tokens[i + 1]) &&
          /^[a-zA-Z]+$/.test(tokens[i + 2])
        ) {
          const nextWord = tokens[i + 2]
          const combined = (token + ' ' + nextWord).toLowerCase()
          const combinedAlias = wordAliasMap[combined] || 
            token.charAt(0).toUpperCase() + token.slice(1).toLowerCase() + nextWord.charAt(0).toUpperCase() + nextWord.slice(1).toLowerCase()
          const combinedFuncName = `createWord${combinedAlias}`
          const combinedAnimation = AlphabetGestures[combinedFuncName]

          if (typeof combinedAnimation === 'function') {
            ctx.animations.push(['add-text', token.charAt(0)])
            combinedAnimation(ctx)
            ctx.animations.push(['add-text', token.slice(1) + tokens[i + 1] + nextWord])
            i += 3
            continue
          }
        }

        if (typeof wordAnimation === 'function') {
          ctx.animations.push(['add-text', token.charAt(0)])
          wordAnimation(ctx)
          if (token.length > 1) {
            ctx.animations.push(['add-text', token.slice(1)])
          }
        } else {
          // Spell letter by letter using A-Z alphabet keyframes
          for (const char of token) {
            const upperChar = char.toUpperCase()
            const letterFuncName = `createLetter${upperChar}`
            const letterAnimation = AlphabetGestures[letterFuncName]

            if (typeof letterAnimation === 'function') {
              ctx.animations.push(['add-text', char])
              letterAnimation(ctx)
            } else {
              ctx.animations.push(['add-text', char])
              ctx.animations.push([])
            }
          }
        }
      } else {
        for (const char of token) {
          ctx.animations.push(['add-text', char])
          ctx.animations.push([])
        }
      }
    }

    if (!ctx.pending) {
      ctx.pending = true
    }
  }, [])

  const resetToDefaultPose = useCallback(() => {
    const ctx = contextRef.current
    if (ctx.avatar && isMountedRef.current) {
      ctx.animations = []
      boneTransitionsRef.current.clear()
      setDefaultPose(ctx)
    }
  }, [])

  return {
    executeSignSequence,
    resetToDefaultPose,
    context: contextRef.current
  }
}
