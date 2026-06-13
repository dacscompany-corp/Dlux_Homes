# Images Folder

## Structure

```
public/images/
├── rooms/          # Room photos
│   ├── room1-1.jpg
│   ├── room1-2.jpg
│   ├── room1-3.jpg
│   └── ...
├── logo.png        # Site logo (already exists in public/)
└── README.md       # This file
```

## Room Images

Place your room images in the `rooms/` folder with the following naming convention:
- `room{roomId}-{imageNumber}.jpg`

Example:
- `room1-1.jpg` - First image for room 1
- `room1-2.jpg` - Second image for room 1
- `room2-1.jpg` - First image for room 2

## Image Guidelines

- **Format**: JPG or PNG
- **Recommended size**: 1200x800px or similar aspect ratio
- **Max file size**: 500KB per image (optimize for web)
- **Quality**: High quality but compressed for web performance

## Usage

Reference images in your code as:
```typescript
images: [
  "/images/rooms/room1-1.jpg",
  "/images/rooms/room1-2.jpg",
  // ...
]
```
