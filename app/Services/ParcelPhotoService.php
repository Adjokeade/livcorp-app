<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Enregistre la photo d'un colis. Le fichier est systématiquement décodé puis ré-encodé
 * en JPEG réduit (1600 px max) : on ne stocke jamais l'original, ce qui écarte les
 * fichiers déguisés en image, les données GPS/EXIF (adresse du client dans la photo)
 * et les photos de 10 Mo inutilement lourdes pour le livreur sur réseau mobile.
 */
class ParcelPhotoService
{
    private const MAX_SIDE = 1600;

    public function store(UploadedFile $file, string $folder = 'orders'): string
    {
        $image = @imagecreatefromstring((string) file_get_contents($file->getRealPath()));

        if ($image === false) {
            throw ValidationException::withMessages(['photo' => 'Cette photo est illisible. Essayez une autre image.']);
        }

        $image = $this->orient($image, $file->getRealPath());

        $width = imagesx($image);
        $height = imagesy($image);
        $scale = min(1, self::MAX_SIDE / max($width, $height));
        $targetW = max(1, (int) round($width * $scale));
        $targetH = max(1, (int) round($height * $scale));

        // Fond blanc : un PNG transparent deviendrait noir une fois converti en JPEG.
        $canvas = imagecreatetruecolor($targetW, $targetH);
        imagefill($canvas, 0, 0, imagecolorallocate($canvas, 255, 255, 255));
        imagecopyresampled($canvas, $image, 0, 0, 0, 0, $targetW, $targetH, $width, $height);

        ob_start();
        imagejpeg($canvas, null, 82);
        $jpeg = (string) ob_get_clean();

        $path = $folder.'/'.Str::uuid().'.jpg';
        Storage::disk('parcel_photos')->put($path, $jpeg);

        return $path;
    }

    public function delete(?string $path): void
    {
        if ($path) {
            Storage::disk('parcel_photos')->delete($path);
        }
    }

    /** Remet la photo à l'endroit selon l'orientation EXIF (photos prises au téléphone). */
    private function orient(\GdImage $image, string $file): \GdImage
    {
        $exif = @exif_read_data($file);
        $angle = match ($exif['Orientation'] ?? 1) {
            3 => 180,
            6 => -90,
            8 => 90,
            default => 0,
        };

        return $angle ? (imagerotate($image, $angle, 0) ?: $image) : $image;
    }
}
