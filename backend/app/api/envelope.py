"""Formato único de respuesta: {success, data, error, meta}."""

from pydantic import BaseModel


class ErrorBody(BaseModel):
    code: str
    message: str


class Meta(BaseModel):
    total: int | None = None


class Envelope[T](BaseModel):
    success: bool
    data: T | None = None
    error: ErrorBody | None = None
    meta: Meta | None = None


def ok[T](data: T, meta: Meta | None = None) -> Envelope[T]:
    return Envelope[T](success=True, data=data, meta=meta)


def failure(code: str, message: str) -> Envelope[None]:
    return Envelope[None](success=False, error=ErrorBody(code=code, message=message))
